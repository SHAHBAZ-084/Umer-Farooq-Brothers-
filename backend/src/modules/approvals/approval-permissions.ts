import { UserRole } from '@prisma/client';
import { AppError } from '../../utils/helpers';

export type ApprovalEditor = {
  id: number;
  role: UserRole;
};

export function assertCanEditPendingRecord(
  editor: ApprovalEditor,
  createdById: number | null | undefined,
): void {
  if (editor.role === UserRole.ADMIN) return;
  if (createdById != null && createdById === editor.id) return;
  throw new AppError(403, 'You can only edit your own pending record');
}
