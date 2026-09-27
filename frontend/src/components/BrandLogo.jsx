import { useSettings } from '../context/SettingsContext';

export function BrandLogo({ height = 28, className }) {
  const { settings } = useSettings();

  if (settings?.logoUrl) {
    return (
      <img
        src={settings.logoUrl}
        alt={settings.brandName || 'Satvex'}
        height={height}
        className={className}
      />
    );
  }

  // Graceful fallback before settings load, or if no logo has been uploaded yet.
  return (
    <span className={className} style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.02em' }}>
      {settings?.brandName || 'Satvex'}
    </span>
  );
}
