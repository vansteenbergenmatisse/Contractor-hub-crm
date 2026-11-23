"use client";

import { distanceLabel, distanceMiles } from "../api/distance";
import { useLocation } from "../hooks/use-location";
import type { LatLng } from "../types";

const HELP = "Location works while this page is open. It stays on this device and is never sent or saved.";
const FAILURES = {
  denied: "Location is blocked. Allow it for this site in your browser settings. If this app is open inside HighLevel, open it in its own browser tab.",
  unavailable: "Your location can't be found right now.",
  unsupported: "This browser can't share a location.",
} as const;

// Optional. Nothing is asked until the button is tapped. Start works without it.
export function LocationPanel({ destination }: { destination: LatLng | null }) {
  const { status, position, start, stop } = useLocation();
  const watching = status === "asking" || status === "on";
  const failed = status === "denied" || status === "unavailable" || status === "unsupported";
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <p className="fd-ds">{HELP}</p>
      {status === "asking" ? <p className="fd-ds" role="status">Finding your location.</p> : null}
      {status === "on" && position ? (
        <p className="fd-dl" role="status">
          <span>{destination ? distanceLabel(distanceMiles(position, destination)) : "Location is on. Distance isn't available for this address."}</span>
        </p>
      ) : null}
      {failed ? <p className="fd-ds" role="alert">{FAILURES[status]}</p> : null}
      {watching ? <button type="button" className="fd-btn is-plain" onClick={stop}>Stop using location</button> : null}
      {status === "idle" ? <button type="button" className="fd-btn is-plain" onClick={start}>Use my location</button> : null}
      {status === "denied" || status === "unavailable" ? <button type="button" className="fd-btn is-plain" onClick={start}>Try again</button> : null}
    </div>
  );
}
