import { ShieldCheck } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import './OtpSenderNote.css';

// Tells the customer WHO will message them. The verification code isn't sent
// by SATVEX itself but by a third-party verification service, and its name
// (not ours) appears as the sender — without a heads-up that looks like a
// stranger texting them. The name comes from the server's public settings
// (`otpSenderName`), so this renders nothing when no third-party sender is
// active and can never name a provider that isn't really in use.
//
// step: 'phone' (before sending) | 'code' (code entry) | 'checkout' (compact)
export function OtpSenderNote({ step = 'phone' }) {
  const { settings } = useSettings();
  const sender = settings?.otpSenderName;
  if (!sender) return null;

  let body;
  if (step === 'code') {
    body = (
      <>
        Look for a message from <strong>{sender}</strong> on WhatsApp or SMS. SATVEX will never ask you to share this
        code with anyone.
      </>
    );
  } else if (step === 'checkout') {
    body = (
      <>
        The code is sent by <strong>{sender}</strong>, our verification partner, on WhatsApp or SMS.
      </>
    );
  } else {
    body = (
      <>
        For your security, your code is sent by <strong>{sender}</strong>, our trusted verification partner, on
        WhatsApp (or SMS). The message will show <strong>{sender}</strong> as the sender — it&apos;s sent on
        SATVEX&apos;s behalf.
      </>
    );
  }

  return (
    <p className={`otp-sender-note otp-sender-note-${step}`}>
      <ShieldCheck size={16} aria-hidden="true" />
      <span>{body}</span>
    </p>
  );
}
