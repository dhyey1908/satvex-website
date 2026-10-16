import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { BRAND_COLORS } from '../constants/brandColors';
import { getCachedLogoUrl } from '../utils/logoCache';
import './BrandLoader.css';

export const DEFAULT_TAGLINE = 'A little detail makes all the difference.';
const DEFAULT_LABEL = 'Loading…';

// Eight dots, one per signature product color; a soft wave of light travels
// across them. Pure CSS (transform/opacity only), so it stays smooth on phones.
export function BrandDots({ size = 'md', className = '' }) {
  return (
    <span className={`brand-dots brand-dots--${size} ${className}`.trim()} aria-hidden="true">
      {BRAND_COLORS.map((c, i) => (
        <span key={c.name} className="brand-dot" style={{ '--dot-color': c.hex, '--dot-i': i }} />
      ))}
    </span>
  );
}

/**
 * variant:
 *  - 'page'    a whole page/screen is waiting (logo + dots + tagline)
 *  - 'section' one block of a page is waiting (dots + tagline)
 *  - 'full'    covers the whole viewport (first load, placing an order)
 * `label` is announced to screen readers and, when it says something specific
 * ("Placing your order…"), shown above the tagline.
 */
export function BrandLoader({ variant = 'page', label, tagline = DEFAULT_TAGLINE, leaving = false }) {
  const { settings } = useSettings();
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const logoUrl = settings?.logoUrl || getCachedLogoUrl();
  const showLogo = variant !== 'section';
  const text = label || DEFAULT_LABEL;
  const showLabel = Boolean(label) && label !== DEFAULT_LABEL;
  const hasLogo = Boolean(logoUrl) && !logoFailed;

  return (
    <div
      className={`brand-loader brand-loader--${variant}${leaving ? ' brand-loader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
    >
      {showLogo && (
        <>
          {/* The wordmark holds the spot until the logo image has actually
              loaded, so the slot is never blank and nothing jumps. The image
              itself downloads off-screen in the meantime. */}
          {hasLogo && (
            <img
              className={logoLoaded ? 'brand-loader__logo' : 'visually-hidden'}
              src={logoUrl}
              alt={settings?.brandName || 'Satvex'}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoFailed(true)}
            />
          )}
          {!(hasLogo && logoLoaded) && <span className="brand-loader__wordmark">{settings?.brandName || 'SATVEX'}</span>}
        </>
      )}
      <BrandDots size={variant === 'section' ? 'md' : 'lg'} />
      {showLabel ? <p className="brand-loader__label">{label}</p> : <span className="visually-hidden">{text}</span>}
      <p className="brand-loader__tagline">{tagline}</p>
    </div>
  );
}
