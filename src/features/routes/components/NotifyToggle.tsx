const LABEL = "Notify the client when you start";

// Off until the user turns it on. The switch look is the one Automations uses.
export function NotifyToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`fd-swb${on ? " is-on" : ""}`} role="switch" aria-checked={on} aria-label={LABEL} onClick={onToggle}>
      <i aria-hidden="true" /><span>{LABEL}</span>
    </button>
  );
}
