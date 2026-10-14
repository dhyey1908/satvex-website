import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { phoneService } from '../services/phoneService';
import { useToast } from '../context/ToastContext';
import { useCountdown, formatClock } from '../hooks/useCountdown';
import { describeOtpError } from '../utils/otpErrors';
import './PhoneVerification.css';

// key={phone} on the parent's usage resets all of this component's state
// whenever the phone number itself changes, so a changed number can never
// silently inherit a previous number's "sent"/"verified" UI state.
//
// Limits (60s between codes, 3 codes / 10 min, 5 wrong guesses per code) are
// enforced by the server (otpService.js); the timers and counts here are
// whatever it reports back.
export function PhoneVerification({ phone, verified, onVerified, autoSend = false }) {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [codeUnusable, setCodeUnusable] = useState(false);
  const [sendsRemaining, setSendsRemaining] = useState(null);
  const resend = useCountdown();
  const limit = useCountdown();
  const inputRef = useRef(null);

  const validPhone = /^[0-9]{10}$/.test(phone);

  // Fires once per mount (parent's key={phone} guarantees a fresh mount
  // whenever the number itself changes). phoneController.sendOtp already
  // short-circuits to alreadyVerified when this exact number is still
  // within its 30-day verified window, so for the common case (checkout
  // address phone == account phone) this resolves instantly via handleSend
  // below with no OTP box ever shown.
  useEffect(() => {
    if (autoSend && !verified && validPhone) handleSend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend({ isResend = false } = {}) {
    setSending(true);
    setError(null);
    try {
      const result = await phoneService.sendOtp(phone);
      if (result.alreadyVerified) {
        onVerified();
      } else {
        setSent(true);
        setCode('');
        setCodeUnusable(false);
        resend.start(result.resendAfterSeconds ?? 60);
        setSendsRemaining(typeof result.sendsRemaining === 'number' ? result.sendsRemaining : null);
        showToast(isResend ? 'A new code is on its way.' : 'Verification code sent to your mobile number.', 'success');
      }
    } catch (err) {
      const info = describeOtpError(err);
      setError(info.message);
      if (info.kind === 'wait') {
        resend.start(info.retryAfterSeconds);
        if (info.canUseLatestCode) setSent(true);
      } else if (info.kind === 'limit') {
        limit.start(info.retryAfterSeconds);
        setSendsRemaining(0);
        if (info.canUseLatestCode) setSent(true);
      }
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e) {
    e?.preventDefault?.();
    if (codeUnusable || code.length !== 6) return;
    setVerifying(true);
    setError(null);
    try {
      await phoneService.verifyOtp(phone, code);
      setSent(false);
      setCode('');
      onVerified();
      showToast('Mobile number verified.', 'success');
    } catch (err) {
      const info = describeOtpError(err);
      setError(info.message);
      setCode('');
      if (info.kind === 'dead') setCodeUnusable(true);
      else setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setVerifying(false);
    }
  }

  if (!validPhone) return null;

  if (verified) {
    return (
      <p className="phone-verify-status">
        <CheckCircle2 size={15} /> Mobile number verified
      </p>
    );
  }

  const resendBlocked = sendsRemaining === 0 || limit.seconds > 0;
  const canResendNow = resend.seconds === 0 && !resendBlocked && !sending;

  let resendHint = null;
  if (!canResendNow && !sending) {
    if (limit.seconds > 0) {
      resendHint = `All codes used. You can request another in ${formatClock(limit.seconds)}.`;
    } else if (sendsRemaining === 0) {
      resendHint = codeUnusable
        ? 'All 3 codes used for now. Please try again in a few minutes.'
        : 'All 3 codes used for now. Use the latest code we sent.';
    } else if (resend.seconds > 0) {
      resendHint = `New code in ${formatClock(resend.seconds)}`;
    }
  }

  return (
    <div className="phone-verify-box">
      {!sent ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleSend()} disabled={sending}>
          {sending ? <Loader2 size={14} className="btn-spinner" /> : 'Verify Mobile Number'}
        </button>
      ) : (
        // Deliberately not a <form> — this renders inside Checkout's own
        // outer <form onSubmit={handleSubmit}> (order placement), and a
        // nested <form> is invalid HTML whose submit-event behavior across
        // browsers is undefined; CouponInput.jsx hit this exact trap first
        // (see its own comment). type="button" + onKeyDown Enter handling
        // gets the same UX without ever creating a second <form>.
        <div className="phone-verify-otp-row">
          <input
            ref={inputRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            aria-label="6-digit verification code"
            value={code}
            disabled={codeUnusable}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleVerify(e);
            }}
            autoFocus
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleVerify}
            disabled={verifying || codeUnusable || code.length !== 6}
          >
            {verifying ? <Loader2 size={14} className="btn-spinner" /> : 'Verify'}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${codeUnusable ? 'btn-outline' : 'btn-ghost'}`}
            onClick={() => handleSend({ isResend: true })}
            disabled={!canResendNow}
          >
            {sending ? <Loader2 size={14} className="btn-spinner" /> : codeUnusable ? 'Send new code' : 'Resend'}
          </button>
        </div>
      )}
      {sent && resendHint && <p className="phone-verify-hint">{resendHint}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
