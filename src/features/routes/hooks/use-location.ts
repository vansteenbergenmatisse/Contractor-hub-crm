"use client";

import { useEffect, useState } from "react";
import type { LatLng, LocationStatus } from "../types";

const OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 };
const PERMISSION_DENIED = 1;

// The browser's location, asked for only after a tap and watched only while the page is visible. The
// position lives in this component's memory: it is never sent, logged or stored.
export function useLocation() {
  const [wanted, setWanted] = useState(false);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [position, setPosition] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!wanted) return;
    const geo = navigator.geolocation;
    let watchId: number | null = null;
    const pause = () => {
      if (watchId === null) return;
      geo.clearWatch(watchId);
      watchId = null;
    };
    const watch = () => {
      if (watchId !== null) return;
      watchId = geo.watchPosition(
        (fix) => {
          if (watchId === null) return;
          setPosition({ lat: fix.coords.latitude, lng: fix.coords.longitude });
          setStatus("on");
        },
        (error) => {
          if (watchId === null) return;
          setPosition(null);
          setStatus(error.code === PERMISSION_DENIED ? "denied" : "unavailable");
          setWanted(false);
        },
        OPTIONS,
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        pause();
        setPosition(null);
      } else {
        watch();
      }
      setStatus("asking");
    };
    if (!document.hidden) watch();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      pause();
    };
  }, [wanted]);

  const start = () => {
    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus("asking");
    setWanted(true);
  };
  const stop = () => {
    setWanted(false);
    setPosition(null);
    setStatus("idle");
  };
  return { status, position, start, stop };
}
