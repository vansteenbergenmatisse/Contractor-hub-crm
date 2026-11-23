import { isNotifiableCalendar, REFUSAL_COPY } from "../api/notify-rule";
import type { NotifyDisplay, RouteJob } from "../types";
import { LocationPanel } from "./LocationPanel";
import { NotifyStatus } from "./NotifyStatus";
import { NotifyToggle } from "./NotifyToggle";
import { StartLink } from "./StartLink";

type NextJobNotify = { on: boolean; onToggle: () => void; onStart: (job: RouteJob) => void; result: NotifyDisplay | null };

// The one job to act on now. Only this card's Start can notify a client.
export function NextJobCard({ job, notify }: { job: RouteJob; notify?: NextJobNotify | null }) {
  const blocked = notify?.on && !notify.result && !isNotifiableCalendar(job.service);
  return (
    <section className="fd-card fd-in" aria-labelledby="routes-next" style={{ padding: 16, marginBottom: 12 }}>
      <span id="routes-next" className="fd-chip is-next">Next job</span>
      <h2 className="fd-dn">{job.name}</h2>
      {job.service ? <p className="fd-ds">{job.service}</p> : null}
      <p className="fd-dl"><span>{job.timeLabel}</span></p>
      <p className="fd-dl"><span>{job.address ?? "No address on this job."}</span></p>
      {job.statusLabel ? <p className="fd-dl"><span>{job.statusLabel}</span></p> : null}
      {job.pastTime ? <p className="fd-ds">This job&apos;s time has passed, but it isn&apos;t marked done.</p> : null}
      {notify && job.mapsUrl ? <div style={{ marginTop: 12 }}><NotifyToggle on={notify.on} onToggle={notify.onToggle} /></div> : null}
      {blocked ? <p className="fd-ds">{REFUSAL_COPY.wrong_type}</p> : null}
      {job.mapsUrl ? <div style={{ display: "grid", marginTop: 12 }}><StartLink job={job} primary onStart={notify?.onStart} /></div> : null}
      {notify?.result ? <div style={{ marginTop: 8 }}><NotifyStatus result={notify.result} /></div> : null}
      <LocationPanel key={job.id} destination={job.coords} />
    </section>
  );
}
