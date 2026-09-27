import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import './Auth.css';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-page">
        <h1>Check your email</h1>
        <p>If an account exists for {email}, we&apos;ve sent a password reset link.</p>
        <Link to="/login" className="btn btn-outline btn-block">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>Forgot Password</h1>
      <p>Enter your email and we&apos;ll send you a reset link.</p>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <p className="auth-footer">
        <Link to="/login">Back to Login</Link>
      </p>
    </div>
  );
}
