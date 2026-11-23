import type { CSSProperties } from "react";

// The page title and its one line of help.
export function RoutesHeader({ timeZone }: { timeZone?: string }) {
  return (
    <section className="fd-phd fd-in" style={{ "--i": 0 } as CSSProperties}>
      <h1 className="fd-pt">Routes</h1>
      <p className="fd-pw">Today&apos;s jobs, in time order.{timeZone ? ` Times are in ${timeZone}.` : ""}</p>
    </section>
  );
}
