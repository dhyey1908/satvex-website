import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AuthLayout } from '../components/AuthLayout';
import { PasswordStrength } from '../components/PasswordStrength';
import { minLength, email as validateEmail, phone as validatePhone, password as validatePassword, runValidators, hasErrors } from '../utils/validators';
import { mapServerFieldErrors } from '../utils/formErrors';
import './Auth.css';

function validate(values) {
  return runValidators({
    name: () => minLength(values.name, 2, 'Full name'),
    email: () => validateEmail(values.email),
    phone: () => validatePhone(values.phone, { optional: true }),
    password: () => validatePassword(values.password),
  });
}

export function Signup() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const errors = validate(form);
    setFieldErrors(errors);
    setTouched({ name: true, email: true, phone: true, password: true });
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      await register(form);
      showToast('Account created — welcome to Satvex!', 'success');
      navigate('/', { replace: true });
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
          <Link to="/login" className="auth-tab">Sign In</Link>
          <span className="auth-tab active">Create Account</span>
        </div>

        <h1 className="text-headline-lg">Join Satvex</h1>
        <p className="auth-subcopy">Create an account to save your wishlist and check out faster.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className={`field ${touched.name && fieldErrors.name ? 'invalid' : ''}`}>
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              required
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              onBlur={() => markTouched('name')}
            />
            {touched.name && fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>
          <div className={`field ${touched.email && fieldErrors.email ? 'invalid' : ''}`}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              onBlur={() => markTouched('email')}
            />
            {touched.email && fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>
          <div className={`field ${touched.phone && fieldErrors.phone ? 'invalid' : ''}`}>
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              onBlur={() => markTouched('phone')}
            />
            {touched.phone && fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
          </div>
          <div className={`field ${touched.password && fieldErrors.password ? 'invalid' : ''}`}>
            <label htmlFor="password">Password</label>
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

          {error && <p className="field-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="btn-spinner" /> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
