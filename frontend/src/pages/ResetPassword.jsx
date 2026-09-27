import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';
import './Auth.css';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const uid = searchParams.get('uid');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authService.resetPassword({ uid, token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message);
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

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="password">New Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
