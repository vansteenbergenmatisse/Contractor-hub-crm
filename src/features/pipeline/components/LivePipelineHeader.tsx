// The page heading of the real board. The line says plainly why nothing on the board can be moved.
export function LivePipelineHeader({ noteId }: { noteId?: string }) {
  return (
    <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="fd-pt">Pipeline</h1>
      <p className="fd-pw" id={noteId}>Your open deals. Moving a card is off for now, because a stage change can start an automation.</p>
    </section>
  );
}
