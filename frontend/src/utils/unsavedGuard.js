// Tiny shared flag: is the admin page on screen holding unsaved edits? The save bar sets it;
// the admin menu reads it to ask before navigating away (the browser handles tab close / refresh).
let dirty = false;

export const setUnsavedChanges = (value) => {
  dirty = Boolean(value);
};

/** true = fine to leave. */
export function confirmLeave() {
  return !dirty || window.confirm('You have unsaved changes. Leave without saving?');
}
