"use client";

import { useEffect, useState } from "react";

// The business logo in the round mark: the initials stay until the image has loaded, and stay for
// good when the link is broken (build prompt section 5). The image is a CSS background of the
// existing `.fd-logo` design class, so no remote image host has to be allow-listed.
export function BrandLogo({ url, initials }: { url: string | null; initials: string }) {
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
  const show = url !== null && loaded === url;
  return (
    <span
      className={`fd-logo${show ? " has-img" : ""}`}
      aria-hidden="true"
      style={show ? { backgroundImage: `url("${url}")` } : undefined}
    >
      <span>{initials}</span>
    </span>
  );
}
