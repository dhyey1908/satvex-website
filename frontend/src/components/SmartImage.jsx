import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './SmartImage.css';

/**
 * A normal <img> that never shows a half-painted picture or a hole.
 *   - while the picture is still loading it is invisible and its box shows a soft shimmer (the box keeps its size, so
 *     nothing jumps or shows a mismatched half-image);
 *   - once it has fully loaded it fades in;
 *   - with no `src`, or when the picture fails to load, the same box shows a neutral picture placeholder instead
 *     (or `fallback`, when a caller wants its own).
 * Takes every <img> prop. The shimmer is painted on the image's parent (the box that gives the image its size).
 */
export const SmartImage = forwardRef(function SmartImage({ src, alt = '', className = '', fallback, onLoad, onError, ...rest }, forwardedRef) {
  const ref = useRef(null);
  const [status, setStatus] = useState(src ? 'loading' : 'error');

  const setRefs = useCallback(
    (node) => {
      ref.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  // A new picture starts again from "loading".
  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  // Already in the browser's cache: its load event fired before React could listen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && src && el.complete) setStatus(el.naturalWidth > 0 ? 'loaded' : 'error');
  }, [src]);

  // Tell the parent box to shimmer while this picture loads.
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || status !== 'loading') return undefined;
    parent.setAttribute('data-img-loading', '');
    return () => parent.removeAttribute('data-img-loading');
  }, [status]);

  if (status === 'error') {
    return (
      fallback ?? (
        <span className="smart-img-fallback" role="img" aria-label={alt || 'Image not available'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </span>
      )
    );
  }

  return (
    <img
      {...rest}
      ref={setRefs}
      src={src}
      alt={alt}
      className={`${className} smart-img`.trim()}
      data-img={status}
      onLoad={(e) => {
        setStatus('loaded');
        onLoad?.(e);
      }}
      onError={(e) => {
        setStatus('error');
        onError?.(e);
      }}
    />
  );
});
