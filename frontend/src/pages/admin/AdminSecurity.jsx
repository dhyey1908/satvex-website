import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck, ShieldAlert, Copy, LogOut } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { authService } from '../../services/authService';
import { setAuthToken } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Loader } from '../../components/Loader';
import { ErrorState } from '../../components/ErrorState';
import './Admin.css';

/**
 * Settings → Security: two-step sign-in with an authenticator app (with
 * one-time recovery codes), the session rules, and "Log out all devices".
 */
export function AdminSecurity() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, otpauthUri }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disabling, setDisabling] = useState(false);
  const [formError, setFormError] = useState(null);

  async function load() {
    try {
      setStatus(await adminService.securityStatus());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startSetup() {
    setBusy(true);
    setFormError(null);
    try {
      setSetup(await adminService.totpSetup());
      setCode('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const { recoveryCodes: codes } = await adminService.totpEnable(code);
      setRecoveryCodes(codes);
      setSetup(null);
      setCode('');
      showToast('Two-step sign-in is on.', 'success');
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(e) {
    e.preventDefault();
    const ok = await confirm({
      title: 'Turn off two-step sign-in?',
      message: 'Your account will go back to being protected by the sign-in step alone. You can turn it on again any time.',
      confirmLabel: 'Turn off',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setFormError(null);
    try {
      // A recovery code looks like "ab12c-34def"; an authenticator code is 6 digits.
      await adminService.totpDisable(/^\d{6}$/.test(code.trim()) ? { code: code.trim() } : { recoveryCode: code.trim() });
      setDisabling(false);
      setCode('');
      showToast('Two-step sign-in is off.', 'success');
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logoutEverywhere() {
    const ok = await confirm({
      title: 'Log out of all devices?',
      message: 'Every device signed in to this account, including this one, is signed out right now.',
      confirmLabel: 'Log out everywhere',
      danger: true,
    });
    if (!ok) return;
    try {
      await authService.logoutAll();
      setAuthToken(null);
      showToast('Signed out everywhere.', 'success');
      window.location.assign('/');
      navigate('/');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(
      () => showToast('Copied', 'success'),
      () => showToast('Could not copy — select the text and copy it by hand.', 'error')
    );
  }

  if (error && !status) return <ErrorState message={error} onRetry={load} />;
  if (!status) return <Loader label="Loading security settings…" />;

  return (
    <div>
      <div className="security-card">
        <h3>
          {status.totpEnabled ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />} Two-step sign-in
        </h3>
        <p className="field-hint">
          Signing in needs a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) as well as your password or phone code.
          Even if someone learns your password, they cannot get in without your phone.
        </p>

        {!status.totpEnabled && !setup && !recoveryCodes && (
          <button type="button" className="btn btn-primary" onClick={startSetup} disabled={busy}>
            {busy ? <Loader2 size={16} className="btn-spinner" /> : 'Turn on two-step sign-in'}
          </button>
        )}

        {setup && (
          <form onSubmit={confirmSetup}>
            <ol className="field-hint" style={{ paddingLeft: 18 }}>
              <li>In your authenticator app choose <strong>Add account → Enter a setup key</strong>.</li>
              <li>Type this key (account name: Satvex):</li>
            </ol>
            <code className="security-secret">{setup.secret}</code>
            <p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(setup.secret)}>
                <Copy size={14} aria-hidden="true" /> Copy key
              </button>{' '}
              <a href={setup.otpauthUri} className="btn btn-ghost btn-sm">Open in my authenticator app</a>
            </p>
            <div className={`field ${formError ? 'invalid' : ''}`} style={{ maxWidth: 260 }}>
              <label htmlFor="totp-confirm">3. Enter the 6-digit code it shows</label>
              <input id="totp-confirm" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </div>
            {formError && <p className="field-error" role="alert">{formError}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy || code.replace(/\s/g, '').length < 6}>
              {busy ? <Loader2 size={16} className="btn-spinner" /> : 'Confirm and turn on'}
            </button>{' '}
            <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>Cancel</button>
          </form>
        )}

        {recoveryCodes && (
          <div>
            <p><strong>Save these recovery codes now.</strong> They are shown only once. If you lose your phone, each code lets you sign in a single time.</p>
            <ul className="recovery-codes">
              {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(recoveryCodes.join('\n'))}>
              <Copy size={14} aria-hidden="true" /> Copy all
            </button>{' '}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRecoveryCodes(null)}>I have saved them</button>
          </div>
        )}

        {status.totpEnabled && !recoveryCodes && (
          <>
            <p>
              <span className="pill pill-active">On</span> · {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? '' : 's'} left
            </p>
            {!disabling ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDisabling(true); setFormError(null); }}>Turn off…</button>
            ) : (
              <form onSubmit={turnOff}>
                <div className={`field ${formError ? 'invalid' : ''}`} style={{ maxWidth: 300 }}>
                  <label htmlFor="totp-off">Enter a current code (or a recovery code) to turn it off</label>
                  <input id="totp-off" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                </div>
                {formError && <p className="field-error" role="alert">{formError}</p>}
                <button type="submit" className="btn btn-danger btn-sm" disabled={busy || !code.trim()}>Turn off</button>{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDisabling(false); setCode(''); }}>Cancel</button>
              </form>
            )}
          </>
        )}
      </div>

      <div className="security-card">
        <h3>Sessions</h3>
        <p className="field-hint">
          The admin signs you out after {status.sessionMinutes} minutes without activity. After {status.lockAfterFailedAttempts} wrong passwords or codes in a
          row the account is locked for {status.lockMinutes} minutes.
        </p>
        <button type="button" className="btn btn-danger btn-sm" onClick={logoutEverywhere}>
          <LogOut size={14} aria-hidden="true" /> Log out of all devices
        </button>
      </div>
    </div>
  );
}
