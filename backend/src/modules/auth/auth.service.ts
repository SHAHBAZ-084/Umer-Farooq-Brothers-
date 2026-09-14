import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

const MIN_PASSWORD_LENGTH = 6;

function toPublicUser(user: {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  createdAt?: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    role: user.role,
    ...(user.createdAt ? { createdAt: user.createdAt.toISOString() } : {}),
  };
}

export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return toPublicUser(user);
}

export async function getUserById(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    return null;
  }

  return toPublicUser(user);
}

/** Step-up confirmation: verify the signed-in user's password. */
export async function verifyPasswordByUserId(userId: number, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !password) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      createdAt: true,
    },
  });
  return users.map(toPublicUser);
}

export async function createUser(data: {
  username: string;
  password: string;
  displayName?: string;
}) {
  const username = data.username.trim();
  if (!username) throw new AppError(400, 'Username is required');
  if (username.length < 2) throw new AppError(400, 'Username must be at least 2 characters');

  const password = data.password;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new AppError(400, `Username "${username}" is already taken`);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      displayName: data.displayName?.trim() || null,
      role: UserRole.USER,
    },
  });

  return toPublicUser(user);
}

export async function deleteUser(targetUserId: number, actorUserId: number) {
  if (targetUserId === actorUserId) {
    throw new AppError(400, 'You cannot delete your own account');
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError(404, 'User not found');

  if (target.role === UserRole.ADMIN) {
    const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    if (adminCount <= 1) {
      throw new AppError(400, 'Cannot delete the last admin account');
    }
  }

  const [vouchersCreated, invoicesCreated] = await Promise.all([
    prisma.voucher.count({ where: { createdById: targetUserId } }),
    prisma.invoice.count({ where: { createdById: targetUserId } }),
  ]);

  if (vouchersCreated > 0 || invoicesCreated > 0) {
    throw new AppError(
      400,
      'User has created vouchers or invoices and cannot be deleted',
    );
  }

  await prisma.user.delete({ where: { id: targetUserId } });
  return { ok: true };
}

export async function updateUser(
  targetUserId: number,
  data: {
    username?: string;
    displayName?: string | null;
    role?: UserRole;
  },
) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError(404, 'User not found');

  const nextUsername =
    data.username != null ? data.username.trim() : target.username;
  if (!nextUsername) throw new AppError(400, 'Username is required');
  if (nextUsername.length < 2) {
    throw new AppError(400, 'Username must be at least 2 characters');
  }

  if (nextUsername !== target.username) {
    const taken = await prisma.user.findUnique({ where: { username: nextUsername } });
    if (taken) throw new AppError(400, `Username "${nextUsername}" is already taken`);
  }

  const nextRole = data.role ?? target.role;
  if (nextRole !== UserRole.ADMIN && nextRole !== UserRole.USER) {
    throw new AppError(400, 'Invalid role');
  }

  if (target.role === UserRole.ADMIN && nextRole !== UserRole.ADMIN) {
    const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    if (adminCount <= 1) {
      throw new AppError(400, 'Cannot demote the last admin account');
    }
  }

  const displayNameProvided = Object.prototype.hasOwnProperty.call(data, 'displayName');
  const nextDisplayName = displayNameProvided
    ? (data.displayName?.trim() || null)
    : target.displayName;

  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      username: nextUsername,
      displayName: nextDisplayName,
      role: nextRole,
    },
  });

  return toPublicUser(user);
}

/** Admin sets a new password for any user (no current-password check). */
export async function resetUserPassword(
  targetUserId: number,
  data: { newPassword: string },
) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new AppError(404, 'User not found');

  const newPassword = data.newPassword ?? '';
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: targetUserId },
    data: { passwordHash },
  });

  return { ok: true };
}

export async function changePassword(
  userId: number,
  data: { currentPassword: string; newPassword: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const currentPassword = data.currentPassword ?? '';
  const newPassword = data.newPassword ?? '';

  if (!currentPassword) throw new AppError(400, 'Current password is required');
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError(400, 'Current password is incorrect');

  if (currentPassword === newPassword) {
    throw new AppError(400, 'New password must be different from the current password');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { ok: true };
}
