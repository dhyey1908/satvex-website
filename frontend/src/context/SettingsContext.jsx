import { createContext, useContext, useEffect, useState } from 'react';
import { settingsService } from '../services/settingsService';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  async function refresh() {
    try {
      const { settings: s } = await settingsService.get();
      setSettings(s);
    } catch {
      setSettings(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return <SettingsContext.Provider value={{ settings, refresh }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
