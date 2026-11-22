"use client";

import { useEffect, useState } from "react";

// The business mark at the top of the sheet the customer gets, in the design's `.fd-logo` tile. The
// logo (custom value business_logo, https only) replaces the initials once the image has loaded; a
// broken link keeps the initials. With neither a logo nor a name there is no tile at all: a missing
// value shows nothing (docs/tenant-branding.md).
export function SheetLogo({ url, initials }: { url: string | null; initials: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (alive) setLoaded(url);
    };
    image.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  if (!url && !initials) return null;
  const show = url !== null && loaded === url;
  return (
    <span className={`fd-logo${show ? " has-img" : ""}`} aria-hidden="true" style={show ? { backgroundImage: `url("${url}")` } : undefined}>
      <span className="fd-h">{initials}</span>
    </span>
  );
}
