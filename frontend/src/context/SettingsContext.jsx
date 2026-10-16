import { createContext, useContext, useEffect, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { cacheLogoUrl } from '../utils/logoCache';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  // True until the first settings request has finished, successfully or not.
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { settings: s } = await settingsService.get();
      setSettings(s);
      cacheLogoUrl(s?.logoUrl);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <SettingsContext.Provider value={{ settings, loading, refresh }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
