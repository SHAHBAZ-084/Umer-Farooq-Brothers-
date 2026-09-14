import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';
import {
  DangerButton,
  FieldLabel,
  LegacyTable,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { useAuth } from '../../contexts/AuthContext';
import { api, type User } from '../../lib/api';

export function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'ADMIN' | 'USER'>('USER');
  const [savingEdit, setSavingEdit] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [savingReset, setSavingReset] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const rows = await api.listUsers();
      setUsers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/user" replace />;
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const { user } = await api.createUser({
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      setMessage(`User "${user.username}" created with role ${user.role}.`);
      setUsername('');
      setDisplayName('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(target: User) {
    setEditUser(target);
    setEditUsername(target.username);
    setEditDisplayName(target.displayName === target.username ? '' : target.displayName);
    setEditRole(target.role);
    setError('');
    setMessage('');
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editUser) return;
    setSavingEdit(true);
    setError('');
    setMessage('');
    try {
      const { user } = await api.updateUser(editUser.id, {
        username: editUsername.trim(),
        displayName: editDisplayName.trim() || null,
        role: editRole,
      });
      setMessage(`User "${user.username}" updated.`);
      setEditUser(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  }

  function openReset(target: User) {
    setResetUser(target);
    setResetPassword('');
    setResetConfirm('');
    setError('');
    setMessage('');
  }

  async function onSaveReset(event: FormEvent) {
    event.preventDefault();
    if (!resetUser) return;
    if (resetPassword !== resetConfirm) {
      setError('New password and confirmation do not match');
      return;
    }
    setSavingReset(true);
    setError('');
    setMessage('');
    try {
      await api.resetUserPassword(resetUser.id, { newPassword: resetPassword });
      setMessage(`Password reset for "${resetUser.username}".`);
      setResetUser(null);
      setResetPassword('');
      setResetConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSavingReset(false);
    }
  }

  async function onDelete(target: User) {
    if (!window.confirm(`Remove user "${target.username}"? This cannot be undone.`)) return;
    setDeletingId(target.id);
    setError('');
    setMessage('');
    try {
      await api.deleteUser(target.id);
      setMessage(`User "${target.username}" removed.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageShell
      title="User Management"
      subtitle="Admin only — create, edit, and remove clerk accounts"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-textPrimary">Add clerk</h2>
          <form className="space-y-4" onSubmit={onCreate}>
            <div>
              <FieldLabel>Username</FieldLabel>
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div>
              <FieldLabel>Display name (optional)</FieldLabel>
              <TextInput
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <FieldLabel>Password</FieldLabel>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-textMuted">Minimum 6 characters. New accounts are USER role.</p>
            </div>
            <PrimaryButton type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create user'}
            </PrimaryButton>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-base font-semibold text-textPrimary">All users</h2>
          {loading ? <p className="text-sm text-textSecondary">Loading…</p> : null}
          {!loading && users.length === 0 ? (
            <p className="text-sm text-textSecondary">No users found.</p>
          ) : null}
          {!loading && users.length > 0 ? (
            <LegacyTable>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display name</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const isSelf = row.id === currentUser?.id;
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{row.username}</td>
                      <td>{row.displayName}</td>
                      <td>{row.role}</td>
                      <td className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {isSelf ? (
                            <span className="text-xs text-textMuted">Signed in</span>
                          ) : null}
                          <SecondaryButton type="button" onClick={() => openEdit(row)}>
                            Edit
                          </SecondaryButton>
                          <SecondaryButton type="button" onClick={() => openReset(row)}>
                            Reset password
                          </SecondaryButton>
                          {!isSelf ? (
                            <DangerButton
                              type="button"
                              disabled={deletingId === row.id}
                              onClick={() => void onDelete(row)}
                            >
                              {deletingId === row.id ? 'Removing…' : 'Remove'}
                            </DangerButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </LegacyTable>
          ) : null}
        </Panel>
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-success">{message}</p> : null}

      <div className="mt-6">
        <Link to="/user" className="btn-secondary inline-block px-3 py-1.5 text-sm font-semibold">
          Back to profile
        </Link>
      </div>

      <Modal
        open={Boolean(editUser)}
        title={editUser ? `Edit ${editUser.username}` : 'Edit user'}
        onClose={() => setEditUser(null)}
        footer={
          <>
            <SecondaryButton type="button" onClick={() => setEditUser(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" form="edit-user-form" disabled={savingEdit}>
              {savingEdit ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </>
        }
      >
        <form id="edit-user-form" className="space-y-3" onSubmit={(e) => void onSaveEdit(e)}>
          <div>
            <FieldLabel>Username</FieldLabel>
            <TextInput
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div>
            <FieldLabel>Display name</FieldLabel>
            <TextInput
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <FieldLabel>Role</FieldLabel>
            <select
              className="app-input"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as 'ADMIN' | 'USER')}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetUser)}
        title={resetUser ? `Reset password — ${resetUser.username}` : 'Reset password'}
        onClose={() => setResetUser(null)}
        footer={
          <>
            <SecondaryButton type="button" onClick={() => setResetUser(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" form="reset-password-form" disabled={savingReset}>
              {savingReset ? 'Saving…' : 'Set password'}
            </PrimaryButton>
          </>
        }
      >
        <form id="reset-password-form" className="space-y-3" onSubmit={(e) => void onSaveReset(e)}>
          <p className="text-sm text-textSecondary">
            Set a new password for this user. They do not need their current password.
          </p>
          <div>
            <FieldLabel>New password</FieldLabel>
            <TextInput
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div>
            <FieldLabel>Confirm password</FieldLabel>
            <TextInput
              type="password"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
