import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { BrandLoader } from './BrandLoader';

// First load of the app. The page underneath mounts and starts fetching right
// away - this just covers it until the session and store settings are in and
// the loader has been up long enough to read as intentional. A refresh inside
// the same browser tab holds it for less time: the animation is a welcome, not
// a toll.
const FIRST_VISIT_MIN_MS = 900;
const RETURN_VISIT_MIN_MS = 500;
const FADE_MS = 450;
const SEEN_KEY = 'satvex_boot_seen';

function minimumForThisVisit() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return RETURN_VISIT_MIN_MS;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage blocked: treat as a first visit
  }
  return FIRST_VISIT_MIN_MS;
}

export function BootLoader() {
  const { loading: authLoading } = useAuth();
  const { loading: settingsLoading } = useSettings();
  const [minElapsed, setMinElapsed] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), minimumForThisVisit());
    return () => clearTimeout(t);
  }, []);

  // Both flags also clear when their request FAILS, so an API outage can
  // never leave the storefront stuck behind the loader.
  const ready = minElapsed && !authLoading && !settingsLoading;

  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [ready]);

  if (gone) return null;
  return <BrandLoader variant="full" leaving={ready} />;
}
