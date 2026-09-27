import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AuthLayout } from '../components/AuthLayout';
import { required, email as validateEmail, runValidators, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Auth.css';

export function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(values) {
    return runValidators({
      email: () => validateEmail(values.email),
      password: () => required(values.password, 'Password'),
    });
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleBlur(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ email: true, password: true });
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      const user = await login(form);
      showToast('Welcome back!', 'success');
      const redirectTo = location.state?.from?.pathname || (user.role === 'admin' ? '/admin' : '/');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const serverErrors = mapServerFieldErrors(err);
      if (serverErrors) setFieldErrors((prev) => ({ ...prev, ...serverErrors }));
      else setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <div className="auth-tabs">
          <span className="auth-tab active">Sign In</span>
          <Link to="/signup" className="auth-tab">Create Account</Link>
        </div>

        <h1 className="text-headline-lg">Welcome Back</h1>
        <p className="auth-subcopy">Sign in to view your orders, wishlist, and saved addresses.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              onBlur={() => handleBlur('email')}
            />
            {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>
          <div className={`field ${touched.password && fieldErrors.password ? 'invalid' : ''}`}>
            <div className="field-label-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="auth-inline-link">Forgot password?</Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              onBlur={() => handleBlur('password')}
            />
            {touched.password && fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Log In'}
          </button>
        </form>

        <p className="auth-footer">
          New to Satvex? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
