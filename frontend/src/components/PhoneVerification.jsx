import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { phoneService } from '../services/phoneService';
import { useToast } from '../context/ToastContext';
import './PhoneVerification.css';

// key={phone} on the parent's usage resets all of this component's state
// whenever the phone number itself changes, so a changed number can never
// silently inherit a previous number's "sent"/"verified" UI state.
export function PhoneVerification({ phone, verified, onVerified, autoSend = false }) {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

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

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const result = await phoneService.sendOtp(phone);
      if (result.alreadyVerified) {
        onVerified();
      } else {
        setSent(true);
        showToast('Verification code sent to your mobile number.', 'success');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e) {
    e?.preventDefault?.();
    setVerifying(true);
    setError(null);
    try {
      await phoneService.verifyOtp(phone, code);
      setSent(false);
      setCode('');
      onVerified();
      showToast('Mobile number verified.', 'success');
    } catch (err) {
      setError(err.message);
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

  return (
    <div className="phone-verify-box">
      {!sent ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={handleSend} disabled={sending}>
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
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
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
            disabled={verifying || code.length !== 6}
          >
            {verifying ? <Loader2 size={14} className="btn-spinner" /> : 'Verify'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 size={14} className="btn-spinner" /> : 'Resend'}
          </button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
