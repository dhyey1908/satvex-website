import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/Modal';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: opts.title || 'Are you sure?',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: opts.danger ?? false,
      });
    });
  }, []);

  function close(result) {
    setState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
              {state?.cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${state?.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => close(true)}
              autoFocus
            >
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}
