import { useEffect, useState } from "react";

type Props = { src: string | null; label: string };

// Shows the image only after it has loaded, so a broken link shows nothing. It is a CSS background,
// as in `BrandLogo`; `src` is a parsed https link on an allowed host (see previewSrc).
export function ImagePreview({ src, label }: Props) {
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    const image = new Image();
    let alive = true;
    image.onload = () => {
      if (alive) setLoaded(src);
    };
    image.referrerPolicy = "no-referrer";
    image.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src || loaded !== src) return null;
  return <span className="fd-cvp" role="img" aria-label={`${label} preview`} style={{ backgroundImage: `url("${src}")` }} />;
}
