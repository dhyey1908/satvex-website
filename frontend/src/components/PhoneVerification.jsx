import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { phoneService } from '../services/phoneService';
import { useToast } from '../context/ToastContext';
import './PhoneVerification.css';

// key={phone} on the parent's usage resets all of this component's state
// whenever the phone number itself changes, so a changed number can never
// silently inherit a previous number's "sent"/"verified" UI state.
export function PhoneVerification({ phone, verified, onVerified }) {
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  const validPhone = /^[0-9]{10}$/.test(phone);

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
    e.preventDefault();
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
        <form className="phone-verify-otp-row" onSubmit={handleVerify}>
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={verifying || code.length !== 6}>
            {verifying ? <Loader2 size={14} className="btn-spinner" /> : 'Verify'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 size={14} className="btn-spinner" /> : 'Resend'}
          </button>
        </form>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
