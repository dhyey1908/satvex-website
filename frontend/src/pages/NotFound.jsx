import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

// No "not found" screen: a link that goes nowhere takes the visitor back to the page they were on (when they got here
// by clicking inside the site), otherwise to the home page. (Links opened directly are redirected to home at the CDN.)
export function NotFound() {
  useDocumentMeta({ title: 'Page not found', noindex: true });
  const navigate = useNavigate();
  const { key } = useLocation();
  const left = useRef(false); // once only: going back twice would skip past the page the visitor came from
  useEffect(() => {
    if (left.current) return;
    left.current = true;
    // 'default' is the key of the first page of the visit: nothing inside the site to go back to.
    if (key !== 'default') navigate(-1);
    else navigate('/', { replace: true });
  }, [key, navigate]);
  return null;
}
