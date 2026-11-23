import type { NotifyRefusal, RouteJob } from "../types";

// HighLevel has no field that says job or estimate (docs/greenlane/hl-api-notes.md), so the calendar's
// name decides. Exact names only: "Job Interview" or "Estimate review call" must never notify a client.
// "Schedule a Job" and "Request an Estimate" are the calendars of the JCR snapshot every client copies.
const NOTIFIABLE = new Set(["job", "jobs", "estimate", "estimates", "schedule a job", "request an estimate"]);

export function isNotifiableCalendar(name: string | null | undefined): boolean {
  return NOTIFIABLE.has((name ?? "").trim().replace(/\s+/g, " ").toLowerCase());
}

// The one job a Start may notify for: the first that is neither done nor past. Past means its end time
// has been reached, so a job in progress still counts and a crew running late can tell the client.
export function pickNotifyId(jobs: RouteJob[]): string | null {
  return jobs.find((job) => !job.done && !job.pastTime)?.id ?? null;
}

export const REFUSAL_COPY: Record<NotifyRefusal, string> = {
  wrong_type: "Only calendars named Job or Estimate can notify a client.",
  not_next: "This is no longer the next job. Reload the page.",
  no_contact: "This job has no contact to notify.",
  past: "This job's time has passed, so the client was not notified.",
  unsure_next: "Some jobs may be missing, so the next job isn't certain. The client was not notified.",
  unavailable: "The client was not notified. Tap Start to try again.",
};
