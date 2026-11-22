// The note in a stage column with no cards. `className` hides it (is-off) when the stage has cards.
export function StageEmpty({ className }: { className: string }) {
  return <p className={className}>No cards here</p>;
}
