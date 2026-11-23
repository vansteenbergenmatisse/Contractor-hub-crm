import { Icon } from "@/features/app-shell";
import type { RouteJob } from "../types";

// Opens Google Maps in its own tab, because Maps cannot run inside the HighLevel frame.
export function StartLink({ job, primary, onStart }: { job: RouteJob; primary: boolean; onStart?: (job: RouteJob) => void }) {
  if (!job.mapsUrl) return null;
  return (
    <a
      className={`fd-btn ${primary ? "is-fill" : "is-plain"}`}
      href={job.mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Start directions to ${job.name}`}
      onClick={onStart ? () => onStart(job) : undefined}
    >
      <Icon name="routes" size={16} strokeWidth={2} />Start
    </a>
  );
}
