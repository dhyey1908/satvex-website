import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { email as validateEmail } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Auth.css';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function setValue(value) {
    setEmail(value);
    if (fieldError) setFieldError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setTouched(true);
    const message = validateEmail(email);
    setFieldError(message);
    if (message) return;

    setSubmitting(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors?.email) setFieldError(serverErrors.email);
      else setError(err.message);
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

      <form onSubmit={handleSubmit} noValidate>
        <div className={`field ${touched && fieldError ? 'invalid' : ''}`}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {touched && fieldError && <p className="field-error">{fieldError}</p>}
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
