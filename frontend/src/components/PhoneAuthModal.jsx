import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { useToast } from '../context/ToastContext';
import './PhoneAuthModal.css';

// The only sign-in surface customers ever see: phone number -> OTP -> done.
// Deliberately does NOT reuse phoneService/PhoneVerification's authenticated
// /api/phone/* routes — those are for an already-logged-in user re-verifying
// a (possibly different) phone at checkout. This modal calls the
// unauthenticated /auth/request-otp + /auth/verify-otp pair instead, since
// there's no session yet — verify-otp is also how a brand-new account gets
// created (see authController.verifyOtp).
export function PhoneAuthModal({ open, onClose, onVerified }) {
  const { loginWithOtp } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setStep('phone');
    setPhone('');
    setCode('');
    setError(null);
  }

  function handleModalClose() {
    reset();
    onClose?.();
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!/^[0-9]{10}$/.test(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await authService.requestOtp(phone);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      const { isNewAccount } = await loginWithOtp(phone, code);
      showToast(isNewAccount ? 'Account created — welcome to SATVEX!' : 'Welcome back!', 'success');
      reset();
      onVerified?.(isNewAccount);
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Modal open={open} onClose={handleModalClose} title={step === 'phone' ? 'Sign In' : 'Enter Verification Code'}>
      {step === 'phone' ? (
        <form className="phone-auth-form" onSubmit={handleSend}>
          <p className="phone-auth-copy">Enter your WhatsApp/mobile number to continue.</p>
          <div className="field">
            <label htmlFor="phoneAuthNumber">Mobile Number</label>
            <input
              id="phoneAuthNumber"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              autoFocus
              required
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={sending || phone.length !== 10}>
            {sending ? <Loader2 size={16} className="btn-spinner" /> : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form className="phone-auth-form" onSubmit={handleVerify}>
          <p className="phone-auth-copy">Enter the 6-digit code sent to {phone}.</p>
          <div className="field">
            <label htmlFor="phoneAuthCode">Verification Code</label>
            <input
              id="phoneAuthCode"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={verifying || code.length !== 6}>
            {verifying ? <Loader2 size={16} className="btn-spinner" /> : 'Verify & Continue'}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep('phone')}>
            Change number
          </button>
        </form>
      )}
    </Modal>
  );
}
