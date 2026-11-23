import type { NotifyDisplay, RouteJob } from "../types";
import { NotifyStatus } from "./NotifyStatus";
import { StartLink } from "./StartLink";

const chipTone = (job: RouteJob) => (job.statusLabel === "No show" ? "is-warn" : job.done ? "is-ok" : "is-plain");

// One job in the day's list. The next job's Start lives on its card, and a finished job has none.
export function JobRow({ job, isNext, result }: { job: RouteJob; isNext: boolean; result?: NotifyDisplay | null }) {
  return (
    <li className={`fd-rw${isNext ? " is-sel" : ""}`}>
      <div className="fd-rm">
        <div className="fd-rbx">
          <p className="fd-rl1">
            <span className="fd-rn">{job.name}</span>
            {isNext ? <span className="fd-chip is-next">Next</span> : null}
            {job.statusLabel ? <span className={`fd-chip ${chipTone(job)}`}>{job.statusLabel}</span> : null}
          </p>
          <p className="fd-rsb"><span>{job.timeLabel}</span></p>
          <p className="fd-rad"><span>{job.address ?? "No address on this job."}</span></p>
          {!isNext && result ? <NotifyStatus result={result} /> : null}
        </div>
      </div>
      {!isNext && !job.done && job.mapsUrl ? <div className="fd-rac"><StartLink job={job} primary={false} /></div> : null}
    </li>
  );
}
