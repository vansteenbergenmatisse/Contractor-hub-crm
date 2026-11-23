// The color pad's math. Hue is 0 to 360, saturation and brightness 0 to 100. The pad keeps these
// numbers itself, so the hue survives a trip through black, white or gray.
export type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

// `hex` is #rrggbb.
export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: h * 60, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const sat = s / 100;
  const val = v / 100;
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}

// One arrow key on the square: left and right change saturation, up and down brightness. Any other
// key returns the same object.
export function nudgeHsv(hsv: Hsv, key: string, large: boolean): Hsv {
  const step = large ? 10 : 1;
  switch (key) {
    case "ArrowRight": return { ...hsv, s: clamp(hsv.s + step, 0, 100) };
    case "ArrowLeft": return { ...hsv, s: clamp(hsv.s - step, 0, 100) };
    case "ArrowUp": return { ...hsv, v: clamp(hsv.v + step, 0, 100) };
    case "ArrowDown": return { ...hsv, v: clamp(hsv.v - step, 0, 100) };
    default: return hsv;
  }
}

// A point on the square, as fractions of its width and height from the top left.
export function hsvAt(h: number, x: number, y: number): Hsv {
  return { h, s: clamp(x, 0, 1) * 100, v: (1 - clamp(y, 0, 1)) * 100 };
}

// What the hex field accepts: 6 digits, with or without the #.
export function typedHex(text: string): string | null {
  const v = text.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toUpperCase()}` : null;
}
