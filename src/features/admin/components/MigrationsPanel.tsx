import type { MigrationsView } from "../types";

// Admin only. Plain styling on purpose, like the clients table. Which database migrations this
// environment has, compared with what the deployed code expects.
export function MigrationsPanel({ view }: { view: MigrationsView }) {
  const where = view.ref ? `${view.environment} (${view.ref})` : view.environment;
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p><a href="/admin/clients">Back to clients</a></p>
      <h1>Database migrations</h1>
      <p>Environment: <strong>{where}</strong></p>
      {view.readError ? (
        <p role="alert">Could not read this environment&apos;s migrations. Reload to try again.</p>
      ) : (
        <>
          <p role="status">
            {view.pending.length === 0 && view.problems.length === 0
              ? `All ${view.expected} migrations are applied. None pending.`
              : `${view.applied.length} of ${view.expected} applied. ${view.pending.length} pending.`}
          </p>
          {view.historyMissing ? <p>This database has no migration history table, so every migration is pending.</p> : null}
          {view.pending.length > 0 ? (
            <section aria-labelledby="mg-pending">
              <h2 id="mg-pending">Pending</h2>
              <ul>{view.pending.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
            </section>
          ) : null}
          {view.problems.length > 0 ? (
            <section aria-labelledby="mg-problems">
              <h2 id="mg-problems">Failed or rolled back</h2>
              <ul>{view.problems.map((row, i) => <li key={`${row.name}-${i}`}><code>{row.name}</code>: {row.state === "failed" ? "failed (never finished)" : "rolled back"}</li>)}</ul>
            </section>
          ) : null}
          {view.notInCode.length > 0 ? (
            <section aria-labelledby="mg-extra">
              <h2 id="mg-extra">Applied here, not in this deploy</h2>
              <ul>{view.notInCode.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
            </section>
          ) : null}
        </>
      )}
      <p>How migrations reach each environment: docs/release-migrations.md.</p>
    </main>
  );
}
