import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { modalPanel, bottomSheet, overlayFade } from '../motion';
import './Modal.css';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isMobile;
}

export function Modal({ open, onClose, title, children, footer }) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const panelVariant = isMobile ? bottomSheet : modalPanel;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          onClick={onClose}
          initial={overlayFade.initial}
          animate={overlayFade.animate}
          exit={overlayFade.exit}
        >
          <motion.div
            className={`modal-panel ${isMobile ? 'modal-panel-sheet' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            initial={panelVariant.initial}
            animate={panelVariant.animate}
            exit={panelVariant.exit}
          >
            {isMobile && <div className="modal-sheet-handle" />}
            <div className="modal-header">
              <h3>{title}</h3>
              <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
