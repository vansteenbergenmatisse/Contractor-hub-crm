"use client";

import { useRouter } from "next/navigation";
import { PAGE_PATH } from "@/features/app-shell";
import type { LeadsResult } from "@/features/leads";
import { leadCounts } from "../api/lead-panes";
import { useTimeZone } from "../hooks/use-time-zone";
import { Tile, type TileView } from "./Tile";

function view(result: LeadsResult | null, timeZone: string): TileView {
  const label = "New leads";
  if (!result) return { label, value: null, sub: "", aria: "New leads: loading. Open leads", busy: true };
  const counts = result.state === "ready" ? leadCounts(result, timeZone)
    : result.state === "empty" ? { today: 0, week: 0 }
    : { today: null, week: null };
  const week = counts.week === null ? "" : `${counts.week} this week`;
  if (counts.today === null) return { label, value: null, sub: week, aria: `New leads: ${week || "not available yet"}. Open leads` };
  return { label, value: counts.today, unit: "today", sub: week, aria: `New leads: ${counts.today} today${week ? `, ${week}` : ""}. Open leads` };
}

// Null `result`: still loading.
export function LeadsTile({ result }: { result: LeadsResult | null }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  return <Tile tile={view(result, timeZone)} index={0} onOpen={() => router.push(PAGE_PATH.leads)} />;
}
