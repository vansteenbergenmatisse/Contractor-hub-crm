"use client";

import { useEffect, useState } from "react";

// The link as a clean https URL (`URL.href`, so quotes and spaces come out percent-encoded), or null
// for anything else: another protocol, text that is not a URL, an empty value.
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export type BrandLogoProps = {
  // The logo link. Only an https URL is drawn; anything else keeps the initials.
  url: string | null | undefined;
  initials: string;
  // With neither a usable logo nor initials, draw no tile at all (a missing value shows nothing).
  hideWhenEmpty?: boolean;
};

// A logo in the design's round `.fd-logo` tile: the initials stay until the image has loaded, and stay
// for good when the link is broken. The image is a CSS background of that class, so no remote image
// host has to be allow-listed. Generic: it knows nothing about whose logo it draws.
export function BrandLogo({ url, initials, hideWhenEmpty = false }: BrandLogoProps) {
  const href = safeHttpsUrl(url);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!href) return;
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (alive) setLoaded(href);
    };
    image.src = href;
    return () => {
      alive = false;
    };
  }, [href]);
  if (hideWhenEmpty && !href && !initials) return null;
  const show = href !== null && loaded === href;
  return (
    <span className={`fd-logo${show ? " has-img" : ""}`} aria-hidden="true" style={show ? { backgroundImage: `url("${href}")` } : undefined}>
      <span className="fd-h">{initials}</span>
    </span>
  );
}
