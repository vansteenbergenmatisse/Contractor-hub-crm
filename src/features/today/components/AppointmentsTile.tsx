"use client";

import { useRouter } from "next/navigation";
import { PAGE_PATH } from "@/features/app-shell";
import type { CalendarResult } from "@/features/calendar";
import { todayCalendar } from "../api/today-calendar";
import { Tile, type TileView } from "./Tile";

function view(result: CalendarResult | null): TileView {
  const label = "Appointments";
  if (!result) return { label, value: null, sub: "", aria: "Appointments: loading. Open the calendar", busy: true };
  const day = todayCalendar(result);
  if (!day?.proven) return { label, value: null, sub: "", aria: "Appointments: not available yet. Open the calendar" };
  const week = `${day.week} this week`;
  return { label, value: day.stops.length, unit: "today", sub: week, aria: `Appointments: ${day.stops.length} today, ${week}. Open the calendar` };
}

// Null `result`: still loading.
export function AppointmentsTile({ result }: { result: CalendarResult | null }) {
  const router = useRouter();
  return <Tile tile={view(result)} index={1} onOpen={() => router.push(PAGE_PATH.calendar)} />;
}
