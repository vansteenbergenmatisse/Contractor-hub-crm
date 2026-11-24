"use client";

import { useEffect, useState } from "react";
import { safeHttpsUrl } from "@/shared/lib/safe-https-url";

export { safeHttpsUrl };

export type BrandLogoProps = {
  // The logo link. Only an https URL is drawn; anything else keeps the initials.
  url: string | null | undefined;
  initials: string;
  // With neither a usable logo nor initials, draw no tile at all (a missing value shows nothing).
  hideWhenEmpty?: boolean;
};

// A plain building outline for a tile with neither a logo nor initials (a blank account), so the tile
// is never an empty colored square. Drawn in the tile's text color.
function NeutralMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 10h4a1 1 0 0 1 1 1v10" />
      <path d="M3 21h18M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}

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
      <span className="fd-h">{initials || <NeutralMark />}</span>
    </span>
  );
}
