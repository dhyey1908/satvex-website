import { useEffect, useState } from 'react';

/**
 * Keeps a <video> invisible - and its box shimmering - until its first frame is ready, so no half-loaded or
 * wrong-sized poster flashes first (the same idea as SmartImage). Put `props` on the <video> and give it `ref`.
 */
export function useVideoReady(ref, deps = []) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    setReady(Boolean(el && el.readyState >= 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || ready) return undefined;
    parent.setAttribute('data-img-loading', '');
    return () => parent.removeAttribute('data-img-loading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...deps]);

  return {
    ready,
    props: {
      'data-video': ready ? 'ready' : 'loading',
      onLoadedData: () => setReady(true),
      onCanPlay: () => setReady(true),
    },
  };
}
