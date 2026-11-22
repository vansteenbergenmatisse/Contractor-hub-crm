import type { Lead, LeadsResult } from "@/features/leads";
import { MOCK_LEADS } from "../../../src/features/leads/mock";

// Made-up rows for screen tests only. The app never renders them by itself.
export const LOADED_AT = "2026-03-04T12:00:00.000Z";
export const FIXTURE_LEADS: Lead[] = MOCK_LEADS.map((l) => ({ ...l, receivedAt: "2026-03-04T11:00:00.000Z" }));
export const READY: LeadsResult = { state: "ready", leads: FIXTURE_LEADS, loadedAt: LOADED_AT, complete: true, dropped: 0 };
