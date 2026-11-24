// What a screen reader says for a masked email (j•••@gmail.com): "email starting with j at gmail.com".
export function maskedEmailLabel(masked: string): string {
  const at = masked.indexOf("@");
  return `email starting with ${Array.from(masked)[0]} at ${masked.slice(at + 1)}`;
}

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

// The dots read badly aloud, so the visible text is hidden from screen readers and a spoken version
// is given instead.
export function MaskedEmail({ email }: { email: string }) {
  return (
    <>
      <span aria-hidden="true">{email}</span>
      <span style={VISUALLY_HIDDEN}>{maskedEmailLabel(email)}</span>
    </>
  );
}
