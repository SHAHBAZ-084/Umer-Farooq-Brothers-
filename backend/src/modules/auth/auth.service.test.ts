import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import {
  changePassword,
  createUser,
  deleteUser,
  listUsers,
  login,
} from './auth.service';

describe('auth user management', () => {
  const stamp = Date.now();
  const clerkUsername = `clerk_${stamp}`;
  const clerkPassword = 'clerk123';

  let adminId: number;
  let clerkId: number;

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin' } });
    if (!admin) throw new Error('Seed admin user first');
    adminId = admin.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: UserRole.ADMIN },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: clerkUsername } }).catch(() => {});
  });

  it('createUser always assigns USER role', async () => {
    const user = await createUser({
      username: clerkUsername,
      password: clerkPassword,
      displayName: 'Test Clerk',
    });
    clerkId = user.id;
    expect(user.role).toBe('USER');
    expect(user.displayName).toBe('Test Clerk');
  });

  it('login works for newly created clerk', async () => {
    const user = await login(clerkUsername, clerkPassword);
    expect(user?.username).toBe(clerkUsername);
    expect(user?.role).toBe('USER');
  });

  it('listUsers includes admin and clerk', async () => {
    const users = await listUsers();
    expect(users.some((u) => u.id === adminId && u.role === 'ADMIN')).toBe(true);
    expect(users.some((u) => u.id === clerkId && u.role === 'USER')).toBe(true);
  });

  it('changePassword rejects wrong current password', async () => {
    await expect(
      changePassword(clerkId, { currentPassword: 'wrong', newPassword: 'newpass1' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Current password is incorrect',
    } satisfies Partial<AppError>);
  });

  it('changePassword updates password', async () => {
    const newPassword = 'newpass1';
    await changePassword(clerkId, { currentPassword: clerkPassword, newPassword });
    const user = await login(clerkUsername, newPassword);
    expect(user?.id).toBe(clerkId);
  });

  it('deleteUser blocks self-delete', async () => {
    await expect(deleteUser(adminId, adminId)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('own account'),
    } satisfies Partial<AppError>);
  });

  it('deleteUser removes clerk without activity', async () => {
    const result = await deleteUser(clerkId, adminId);
    expect(result.ok).toBe(true);
    const gone = await prisma.user.findUnique({ where: { id: clerkId } });
    expect(gone).toBeNull();
  });

  it('deleteUser blocks removing the last admin', async () => {
    await expect(deleteUser(adminId, adminId)).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<AppError>);

    const admins = await prisma.user.count({ where: { role: UserRole.ADMIN } });
    expect(admins).toBe(1);
  });

  it('createUser rejects duplicate username', async () => {
    await expect(
      createUser({ username: 'admin', password: 'password1' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('already taken'),
    } satisfies Partial<AppError>);
  });

  it('new users default to USER role in database when role omitted', async () => {
    const username = `default_role_${stamp}`;
    const passwordHash = await bcrypt.hash('password1', 10);
    const row = await prisma.user.create({
      data: { username, passwordHash },
    });
    expect(row.role).toBe(UserRole.USER);
    await prisma.user.delete({ where: { id: row.id } });
  });
});
