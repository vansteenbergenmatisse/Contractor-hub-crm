import type { RouteJob } from "../types";
import { LocationPanel } from "./LocationPanel";
import { StartLink } from "./StartLink";

// The one job to act on now.
export function NextJobCard({ job }: { job: RouteJob }) {
  return (
    <section className="fd-card fd-in" aria-labelledby="routes-next" style={{ padding: 16, marginBottom: 12 }}>
      <span id="routes-next" className="fd-chip is-next">Next job</span>
      <h2 className="fd-dn">{job.name}</h2>
      {job.service ? <p className="fd-ds">{job.service}</p> : null}
      <p className="fd-dl"><span>{job.timeLabel}</span></p>
      <p className="fd-dl"><span>{job.address ?? "No address on this job."}</span></p>
      {job.statusLabel ? <p className="fd-dl"><span>{job.statusLabel}</span></p> : null}
      {job.pastTime ? <p className="fd-ds">This job&apos;s time has passed, but it isn&apos;t marked done.</p> : null}
      {job.mapsUrl ? <div style={{ display: "grid", marginTop: 12 }}><StartLink job={job} primary /></div> : null}
      <LocationPanel key={job.id} destination={job.coords} />
    </section>
  );
}
