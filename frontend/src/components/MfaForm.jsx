import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

/**
 * The second step of an admin sign-in. The first step (password or phone code)
 * already passed; here the admin proves it is really them with the 6-digit code
 * from their authenticator app, a one-time recovery code, or - after a phone
 * code - their account password.
 *
 * `challenge.methods` (from the server) decides which of those are offered.
 */
export function MfaForm({ challenge, onSubmit, submitting, error }) {
  const hasTotp = challenge.methods.includes('totp');
  const hasPassword = challenge.methods.includes('password');
  const [mode, setMode] = useState(hasTotp ? 'code' : 'password'); // 'code' | 'recovery' | 'password'
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit({
      mfaToken: challenge.mfaToken,
      ...(mode === 'code' ? { code: text } : mode === 'recovery' ? { recoveryCode: text } : { password: value }),
    });
  }

  const labels = {
    code: ['Authenticator code', 'Open your authenticator app and enter the 6-digit code for Satvex.'],
    recovery: ['Recovery code', 'Enter one of the recovery codes you saved when you turned on two-step sign-in. Each works once.'],
    password: ['Password', 'Enter your account password to finish signing in.'],
  };
  const [label, help] = labels[mode];

  function switchTo(next) {
    setMode(next);
    setValue('');
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className="auth-subcopy" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <ShieldCheck size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <span>One more step. {help}</span>
      </p>
      <div className={`field ${error ? 'invalid' : ''}`}>
        <label htmlFor="mfa-value">{label}</label>
        <input
          id="mfa-value"
          type={mode === 'password' ? 'password' : 'text'}
          inputMode={mode === 'code' ? 'numeric' : undefined}
          autoComplete={mode === 'code' ? 'one-time-code' : mode === 'password' ? 'current-password' : 'off'}
          maxLength={mode === 'code' ? 7 : mode === 'recovery' ? 12 : 200}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
          autoFocus
          required
        />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !value.trim()}>
        {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Verify and sign in'}
      </button>
      <div className="mfa-switch" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {mode !== 'code' && hasTotp && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo('code')}>Use my authenticator app</button>
        )}
        {mode !== 'password' && hasPassword && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo('password')}>Use my password instead</button>
        )}
        {mode !== 'recovery' && hasTotp && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo('recovery')}>I lost my phone — use a recovery code</button>
        )}
      </div>
    </form>
  );
}
