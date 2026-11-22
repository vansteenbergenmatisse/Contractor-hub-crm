// The page title and its one line of help. Phone and computer get their own sentence.
export function CalendarHeader() {
  return (
    <section className="fd-phd fd-in" style={{ "--i": 0 } as React.CSSProperties}>
      <h1 className="fd-pt">Calendar</h1>
      <p className="fd-pw">
        <span className="fd-wd">Every estimate and job, by day. Customers book their own job date after they accept a quote. Press a stop to see the address or to move it.</span>
        <span className="fd-wm">Every estimate and job, by day. Tap a stop to see where it is or to move it.</span>
      </p>
    </section>
  );
}
