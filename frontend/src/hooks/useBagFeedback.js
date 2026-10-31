import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';

/**
 * What the customer is told after an "Add to bag": "Added to bag · View bag" (the toast links to the bag), or - if
 * it did not work - "Couldn't add to bag. Please try again." A specific reason from the shop (a colour that just
 * went out of stock, say) is shown as it is; anything else (network, server) gets the plain message.
 */
export function useBagFeedback() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const added = useCallback(() => {
    showToast('Added to bag', 'success', 4500, { label: 'View bag', onClick: () => navigate('/cart') });
  }, [showToast, navigate]);

  const failed = useCallback(
    (err) => {
      const specific = err?.status >= 400 && err.status < 500 && err.code && err.code !== 'UNKNOWN_ERROR' && err.message;
      showToast(specific ? err.message : "Couldn't add to bag. Please try again.", 'error');
    },
    [showToast]
  );

  return { added, failed };
}
