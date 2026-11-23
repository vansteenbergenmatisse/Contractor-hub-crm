import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCalendar } from "@/features/calendar";
import { loadInbox } from "@/features/inbox";
import { loadLeads } from "@/features/leads";
import { loadPipeline } from "@/features/pipeline";

afterEach(() => vi.unstubAllEnvs());

describe("live page kill switches tolerate surrounding whitespace", () => {
  it('LEADS_READ_DISABLED="true " stops the leads read', async () => {
    vi.stubEnv("LEADS_READ_DISABLED", "true ");
    const read = vi.fn();
    expect(await loadLeads("t", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it('INBOX_READ_DISABLED="true " stops the inbox read', async () => {
    vi.stubEnv("INBOX_READ_DISABLED", "true ");
    const list = vi.fn();
    const thread = vi.fn();
    expect(await loadInbox("t", { list, thread }, null)).toEqual({ state: "unavailable" });
    expect(list).not.toHaveBeenCalled();
    expect(thread).not.toHaveBeenCalled();
  });

  it('PIPELINE_READ_DISABLED="true " stops the pipeline read', async () => {
    vi.stubEnv("PIPELINE_READ_DISABLED", "true ");
    const read = vi.fn();
    expect(await loadPipeline("t", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it('CALENDAR_READ_DISABLED="true " stops the calendar read', async () => {
    vi.stubEnv("CALENDAR_READ_DISABLED", "true ");
    const read = vi.fn();
    expect(await loadCalendar("t", null, read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });
});
