import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { OtpSenderNote } from './OtpSenderNote';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { useToast } from '../context/ToastContext';
import { useCountdown, formatClock } from '../hooks/useCountdown';
import { describeOtpError } from '../utils/otpErrors';
import './PhoneAuthModal.css';

// The only sign-in surface customers ever see: phone number -> OTP -> done.
// Deliberately does NOT reuse phoneService/PhoneVerification's authenticated
// /api/phone/* routes — those are for an already-logged-in user re-verifying
// a (possibly different) phone at checkout. This modal calls the
// unauthenticated /auth/request-otp + /auth/verify-otp pair instead, since
// there's no session yet — verify-otp is also how a brand-new account gets
// created (see authController.verifyOtp).
//
// The server owns the limits (60s between codes, 3 codes per 10 minutes, 5
// wrong guesses per code — otpService.js). This component only mirrors them:
// every timer/count shown here comes from the server's response, so the two
// can never drift apart.
export function PhoneAuthModal({ open, onClose, onVerified }) {
  const { loginWithOtp } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  // The code on screen can no longer be used (locked / expired) — only a new
  // one will do.
  const [codeUnusable, setCodeUnusable] = useState(false);
  // null = unknown yet; 0 = every code in this window has been used.
  const [sendsRemaining, setSendsRemaining] = useState(null);
  // Set when the server says "too many codes": how long until a new window.
  const [limitNote, setLimitNote] = useState(null);

  const resend = useCountdown();
  const limit = useCountdown();
  const codeInputRef = useRef(null);

  function reset() {
    setStep('phone');
    setPhone('');
    setCode('');
    setError(null);
    setCodeUnusable(false);
    setSendsRemaining(null);
    setLimitNote(null);
    resend.clear();
    limit.clear();
  }

  function handleModalClose() {
    reset();
    onClose?.();
  }

  async function requestCode({ isResend = false } = {}) {
    if (!/^[0-9]{10}$/.test(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const data = await authService.requestOtp(phone);
      setStep('otp');
      setCode('');
      setCodeUnusable(false);
      setLimitNote(null);
      resend.start(data?.resendAfterSeconds ?? 60);
      setSendsRemaining(typeof data?.sendsRemaining === 'number' ? data.sendsRemaining : null);
      if (isResend) showToast('A new code is on its way.', 'success');
    } catch (err) {
      const info = describeOtpError(err);
      setError(info.message);
      if (info.kind === 'wait') {
        resend.start(info.retryAfterSeconds);
        // They already have a live code — let them type it in.
        if (info.canUseLatestCode) setStep('otp');
      } else if (info.kind === 'limit') {
        limit.start(info.retryAfterSeconds);
        setLimitNote(info.canUseLatestCode ? 'usable' : 'wait');
        setSendsRemaining(0);
        if (info.canUseLatestCode) setStep('otp');
      }
    } finally {
      setSending(false);
    }
  }

  // The limits belong to a phone number, so a different number starts clean
  // (the server will say so again if they come back to this one).
  function changeNumber() {
    setStep('phone');
    setError(null);
    setCode('');
    setCodeUnusable(false);
    setSendsRemaining(null);
    setLimitNote(null);
    resend.clear();
    limit.clear();
  }

  async function handleSend(e) {
    e.preventDefault();
    await requestCode();
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (codeUnusable || code.length !== 6) return;
    setError(null);
    setVerifying(true);
    try {
      const { isNewAccount } = await loginWithOtp(phone, code);
      showToast(isNewAccount ? 'Account created — welcome to SATVEX!' : 'Welcome back!', 'success');
      reset();
      onVerified?.(isNewAccount);
    } catch (err) {
      const info = describeOtpError(err);
      setError(info.message);
      setCode('');
      if (info.kind === 'dead') setCodeUnusable(true);
      // Back in the box so they can retype straight away.
      else setTimeout(() => codeInputRef.current?.focus(), 0);
    } finally {
      setVerifying(false);
    }
  }

  const resendBlocked = sendsRemaining === 0 || limit.seconds > 0;
  const canResendNow = resend.seconds === 0 && !resendBlocked && !sending;

  return (
    <Modal open={open} onClose={handleModalClose} title={step === 'phone' ? 'Sign In' : 'Enter Verification Code'}>
      {step === 'phone' ? (
        <form className="phone-auth-form" onSubmit={handleSend}>
          <p className="phone-auth-copy">Enter your WhatsApp/mobile number to continue. We&apos;ll send you a 6-digit code.</p>
          <div className="field">
            <label htmlFor="phoneAuthNumber">Mobile Number</label>
            <input
              id="phoneAuthNumber"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'phoneAuthError' : undefined}
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="field-error" id="phoneAuthError" role="alert">
              {error}
            </p>
          )}
          <OtpSenderNote step="phone" />
          <button type="submit" className="btn btn-primary btn-block" disabled={sending || phone.length !== 10}>
            {sending ? <Loader2 size={16} className="btn-spinner" /> : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form className="phone-auth-form" onSubmit={handleVerify}>
          <p className="phone-auth-copy">
            Enter the 6-digit code we sent to <strong>+91 {phone}</strong> on WhatsApp (or SMS).
          </p>
          <div className="field">
            <label htmlFor="phoneAuthCode">Verification Code</label>
            <input
              id="phoneAuthCode"
              ref={codeInputRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={codeUnusable}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'phoneAuthError' : undefined}
              autoFocus
              required
            />
          </div>
          {error && (
            <p className="field-error" id="phoneAuthError" role="alert">
              {error}
            </p>
          )}
          <OtpSenderNote step="code" />
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={verifying || codeUnusable || code.length !== 6}
          >
            {verifying ? <Loader2 size={16} className="btn-spinner" /> : 'Verify & Continue'}
          </button>

          <div className="phone-auth-resend" aria-live="polite">
            {canResendNow ? (
              <button type="button" className={`btn btn-block ${codeUnusable ? 'btn-outline' : 'btn-ghost'}`} onClick={() => requestCode({ isResend: true })}>
                {codeUnusable ? 'Send a new code' : "Didn't get it? Resend code"}
              </button>
            ) : sending ? (
              <p className="phone-auth-hint">
                <Loader2 size={14} className="btn-spinner" /> Sending a new code…
              </p>
            ) : limit.seconds > 0 ? (
              <p className="phone-auth-hint">
                You&apos;ve used all of your codes for now. You can request another in {formatClock(limit.seconds)}.
                {limitNote === 'usable' && ' Your latest code still works.'}
              </p>
            ) : sendsRemaining === 0 ? (
              <p className="phone-auth-hint">
                You&apos;ve used all 3 codes for now.{' '}
                {codeUnusable
                  ? 'Please try again in a few minutes.'
                  : 'Use the latest code we sent, or try again in a few minutes.'}
              </p>
            ) : (
              <p className="phone-auth-hint">
                You can request a new code in {formatClock(resend.seconds)}
                {sendsRemaining === 1 ? ' (1 more code available)' : ''}.
              </p>
            )}
          </div>

          <button type="button" className="btn btn-ghost btn-block" onClick={changeNumber}>
            Change number
          </button>
        </form>
      )}
    </Modal>
  );
}
