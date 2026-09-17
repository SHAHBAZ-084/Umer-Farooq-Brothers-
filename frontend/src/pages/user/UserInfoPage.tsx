import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';
import {
  FieldLabel,
  FinancialButton,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';

export function UserInfoPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  /** Admin-only secret chord: Ctrl+Shift+Alt+A+S while this page is mounted. */
  useEffect(() => {
    if (!isAdmin) return;

    const held = new Set<string>();

    function clearHeld() {
      held.clear();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey && event.shiftKey && event.altKey)) {
        clearHeld();
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== 'a' && key !== 's') return;
      held.add(key);
      if (held.has('a') && held.has('s')) {
        event.preventDefault();
        clearHeld();
        setPasscode('');
        setPasscodeError('');
        setPasscodeModalOpen(true);
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      held.delete(event.key.toLowerCase());
      if (!event.ctrlKey || !event.shiftKey || !event.altKey) clearHeld();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isAdmin]);

  async function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setPasswordMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  function closePasscodeModal() {
    if (verifyingPasscode) return;
    setPasscodeModalOpen(false);
    setPasscode('');
    setPasscodeError('');
  }

  async function onVerifyPasscode(event: FormEvent) {
    event.preventDefault();
    if (!passcode.trim()) {
      setPasscodeError('Enter the passcode.');
      return;
    }
    setVerifyingPasscode(true);
    setPasscodeError('');
    try {
      await api.verifyFinancialYearClosePasscode(passcode.trim());
      setPasscodeModalOpen(false);
      setPasscode('');
      navigate('/settings/financial-year');
    } catch (err) {
      setPasscodeError(err instanceof Error ? err.message : 'Invalid passcode');
    } finally {
      setVerifyingPasscode(false);
    }
  }

  return (
    <PageShell title="User Information" subtitle="Signed-in clerk profile">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-textSecondary">Display name</p>
            <p className="text-lg font-medium text-textPrimary">{user?.displayName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-textSecondary">Username</p>
            <p className="text-textPrimary">{user?.username}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-textSecondary">Role</p>
            <p className="text-textPrimary">{user?.role ?? '—'}</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {isAdmin ? (
              <Link to="/system/users" className="btn-secondary inline-block px-3 py-1.5 text-sm font-semibold">
                Manage users
              </Link>
            ) : null}
            <SecondaryButton onClick={() => logout()}>Sign out</SecondaryButton>
          </div>
        </Panel>

        <Panel>
          <h2 className="mb-4 text-base font-semibold text-textPrimary">Change password</h2>
          <p className="mb-3 text-sm text-textSecondary">
            Update the password for this signed-in account (admin and clerks).
          </p>
          <form className="space-y-4" onSubmit={onChangePassword}>
            <div>
              <FieldLabel>Current password</FieldLabel>
              <TextInput
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <FieldLabel>New password</FieldLabel>
              <TextInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <FieldLabel>Confirm new password</FieldLabel>
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
            {passwordMessage ? <p className="text-sm text-success">{passwordMessage}</p> : null}
            <PrimaryButton type="submit" disabled={changingPassword}>
              {changingPassword ? 'Updating…' : 'Update password'}
            </PrimaryButton>
          </form>
        </Panel>
      </div>

      <Modal
        open={passcodeModalOpen}
        title="Admin verification"
        onClose={closePasscodeModal}
        footer={
          <>
            <SecondaryButton type="button" onClick={closePasscodeModal} disabled={verifyingPasscode}>
              Cancel
            </SecondaryButton>
            <FinancialButton
              type="submit"
              form="fy-close-passcode-form"
              disabled={verifyingPasscode}
            >
              {verifyingPasscode ? 'Checking…' : 'Continue'}
            </FinancialButton>
          </>
        }
      >
        <form id="fy-close-passcode-form" className="space-y-3" onSubmit={(e) => void onVerifyPasscode(e)}>
          <p className="text-sm text-textSecondary">
            Enter the passcode to open Close Financial Year.
          </p>
          <div>
            <FieldLabel>Passcode</FieldLabel>
            <TextInput
              type="password"
              autoComplete="off"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
            />
          </div>
          {passcodeError ? <p className="text-sm text-danger">{passcodeError}</p> : null}
        </form>
      </Modal>
    </PageShell>
  );
}
