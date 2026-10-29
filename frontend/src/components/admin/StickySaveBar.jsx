import { useEffect } from 'react';
import { setUnsavedChanges } from '../../utils/unsavedGuard';
import './ui.css';

/**
 * Pinned bar for edit-then-save pages (banners, announcements). Shows "Unsaved changes" with
 * Discard / Save while something is dirty, and warns before the tab or the admin menu is left.
 */
export function StickySaveBar({ dirty, saving, onSave, onDiscard, saveLabel = 'Save changes' }) {
  useEffect(() => {
    setUnsavedChanges(dirty);
    const onUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      setUnsavedChanges(false);
    };
  }, [dirty]);

  return (
    <div className={`ui-savebar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label="Save changes">
      <span className="ui-savebar-status" aria-live="polite">
        {dirty ? (
          <>
            <span className="ui-savebar-dot" aria-hidden="true" /> Unsaved changes
          </>
        ) : (
          'All changes saved'
        )}
      </span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onDiscard} disabled={!dirty || saving}>
        Discard
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={!dirty || saving}>
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  );
}
