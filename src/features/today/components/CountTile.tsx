"use client";

import { useRouter } from "next/navigation";
import { PAGE_PATH, type PageKey } from "@/features/app-shell";
import { Tile } from "./Tile";

// A tile with one proven count. Null `count`: "Not available yet". `busy`: still loading.
export function CountTile({ page, label, index, count, unit, busy }: {
  page: PageKey;
  label: string;
  index: number;
  count: number | null;
  unit: string;
  busy?: boolean;
}) {
  const router = useRouter();
  const said = busy ? "loading" : count === null ? "not available yet" : `${count} ${unit}`;
  return <Tile tile={{ label, value: count, unit, sub: "", aria: `${label}: ${said}. Open`, busy }} index={index} onOpen={() => router.push(PAGE_PATH[page])} />;
}
