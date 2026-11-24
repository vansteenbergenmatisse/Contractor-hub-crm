type Props = {
  // The first step with unsaved changes, if any.
  dirtyTitle: string | null;
  currentTitle: string;
  // Any save is running.
  saving: boolean;
  // The save of this step is running.
  savingHere: boolean;
  // The last save of this step failed.
  failed: boolean;
  blocked: boolean;
  readOnly: boolean;
  onOpenSheet: () => void;
  onSave: () => void;
  onCancel: () => void;
};

// Phone only (CSS): the thumb save bar while a step has changes, otherwise the step picker.
export function MobileBar({ dirtyTitle, currentTitle, saving, savingHere, failed, blocked, readOnly, onOpenSheet, onSave, onCancel }: Props) {
  if (dirtyTitle && !readOnly) {
    return (
      <div className="ga-sbar" role="region" aria-label="Save">
        <div className="ga-sbt"><span className="ga-sb1">{dirtyTitle}</span><span className="ga-sb2">{savingHere ? "Saving…" : failed ? "Could not save" : "Not saved yet"}</span></div>
        <button type="button" className="sv-btn is-plain" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className="sv-btn is-fill" aria-label={savingHere ? `Saving ${dirtyTitle}` : undefined} disabled={saving || blocked} onClick={onSave}>{savingHere ? "Saving…" : "Save"}</button>
      </div>
    );
  }
  return (
    <div className="ga-acc">
      <button type="button" className="ga-accs" onClick={onOpenSheet}>
        <span className="ga-acct"><span className="ga-acc1">Jump to a step</span><span className="ga-acc2">{currentTitle}</span></span>
      </button>
    </div>
  );
}
