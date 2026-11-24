// The shell's New lead button and the lead form never import each other. The button sends this event;
// the mounted form calls preventDefault to say it took it. Answers false when nothing took it.
export const NEW_LEAD_EVENT = "crm:new-lead";

export function requestNewLead(): boolean {
  return !window.dispatchEvent(new Event(NEW_LEAD_EVENT, { cancelable: true }));
}
