import { createContext, useContext, useRef, useState } from 'react';
import { BrandLoader } from '../components/BrandLoader';
import { createActionRunner } from '../utils/actionRunner';

const ActionLoaderContext = createContext(null);

/**
 * Full-screen brand loader for critical actions (starting a payment, ...).
 *
 *   await runAction('retry-payment', () => doTheThing(), { label, keepOpen })
 *
 * The rules (shown immediately, minimum time only on success, instant hide on
 * error, duplicate calls join the first) live in utils/actionRunner.js.
 */
export function ActionLoaderProvider({ children }) {
  const [active, setActive] = useState(null);
  const runnerRef = useRef(null);
  if (!runnerRef.current) {
    runnerRef.current = createActionRunner({
      show: setActive,
      hide: (key) => setActive((cur) => (cur?.key === key ? null : cur)),
    });
  }

  return (
    <ActionLoaderContext.Provider value={{ runAction: runnerRef.current }}>
      {children}
      {active && (
        <div className="brand-action-overlay">
          <BrandLoader variant="page" label={active.label} />
        </div>
      )}
    </ActionLoaderContext.Provider>
  );
}

export function useActionLoader() {
  const ctx = useContext(ActionLoaderContext);
  if (!ctx) throw new Error('useActionLoader must be used within ActionLoaderProvider');
  return ctx;
}
