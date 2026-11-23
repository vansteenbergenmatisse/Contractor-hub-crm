import { REFUSAL_COPY } from "../api/notify-rule";
import type { NotifyDisplay } from "../types";

const UNCONFIRMED_HELP = "HighLevel did not answer. Check the contact there before messaging them.";

// The truthful result of a Start. An unconfirmed one never claims the client was told.
export function NotifyStatus({ result }: { result: NotifyDisplay }) {
  if (result.status === "notified") return <p className="fd-dl" role="status"><span className="fd-chip is-ok">Client notified</span></p>;
  if (result.status === "unconfirmed") {
    return (
      <div role="status">
        <p className="fd-dl"><span className="fd-chip is-warn">Not sure if notified</span></p>
        <p className="fd-ds">{UNCONFIRMED_HELP}</p>
      </div>
    );
  }
  return (
    <div role="alert">
      <p className="fd-dl"><span className="fd-chip is-warn">Could not notify</span></p>
      <p className="fd-ds">{result.status === "refused" ? REFUSAL_COPY[result.reason] : "HighLevel refused it. It won't be tried again for this job."}</p>
    </div>
  );
}
