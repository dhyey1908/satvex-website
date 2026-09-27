import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';
import { PasswordStrength } from '../components/PasswordStrength';
import { password as validatePassword, passwordsMatch, runValidators, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Auth.css';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const uid = searchParams.get('uid');
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function validate(values) {
    return runValidators({
      password: () => validatePassword(values.password),
      confirmPassword: () => passwordsMatch(values.confirmPassword, values.password),
    });
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    // Re-check the match once the user edits either password field, so a
    // stale "don't match" error clears the moment they actually match.
    if (key === 'password' && fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: passwordsMatch(form.confirmPassword, value) }));
    }
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ password: true, confirmPassword: true });
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      await authService.resetPassword({ uid, token, password: form.password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err, { newPassword: 'password' });
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || !uid) {
    return (
      <div className="auth-page">
        <h1>Invalid Link</h1>
        <p>This password reset link is invalid or incomplete.</p>
        <Link to="/forgot-password" className="btn btn-outline btn-block">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-page">
        <h1>Password Updated</h1>
        <p>Redirecting you to login…</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Reset Password</h1>
      <p>Choose a new password for your account.</p>

      <form onSubmit={handleSubmit} noValidate>
        <div className={`field ${touched.password && fieldErrors.password ? 'invalid' : ''}`}>
          <label htmlFor="password">New Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            onBlur={() => markTouched('password')}
          />
          <PasswordStrength password={form.password} />
          {touched.password && fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        </div>

        <div className={`field ${touched.confirmPassword && fieldErrors.confirmPassword ? 'invalid' : ''}`}>
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={(e) => setField('confirmPassword', e.target.value)}
            onBlur={() => markTouched('confirmPassword')}
          />
          {touched.confirmPassword && fieldErrors.confirmPassword && (
            <p className="field-error">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
