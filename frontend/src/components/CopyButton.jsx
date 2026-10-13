import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import './CopyButton.css';

const COPIED_RESET_MS = 1800;

// Same clipboard-with-fallback logic as AnnouncementBar's coupon-code copy
// button, pulled out so order IDs (and anything else that needs a quick
// copy affordance) can reuse it instead of re-implementing the fallback.
export function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleCopy(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for browsers/contexts without Clipboard API access (older
      // browsers, non-HTTPS). The value is also visible as plain text next
      // to this button either way, so manual copy is always possible even
      // if this fails outright.
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        document.body.removeChild(textarea);
        return;
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''} ${className}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
    >
      {copied ? <Check size={17} /> : <Copy size={17} />}
    </button>
  );
}
