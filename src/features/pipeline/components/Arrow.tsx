// A right chevron. The CSS turns it around inside a "Previous stage" button (.fd-sprev svg), so
// that button points left at every width. Also the chevron of each stage in the stage list.
export function Arrow({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
