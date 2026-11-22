import type { CSSProperties } from "react";
import { NotAvailableChip } from "./NotAvailableChip";

// A Today card that keeps its place and title and has no real data yet.
export function NotAvailableCard({ id, title, index, className = "" }: { id: string; title: string; index: number; className?: string }) {
  return (
    <section className={`fd-card${className ? ` ${className}` : ""} fd-in`} style={{ "--i": index } as CSSProperties} aria-labelledby={id}>
      <div className="fd-ch"><h2 className="fd-ct" id={id}>{title}</h2><NotAvailableChip /></div>
    </section>
  );
}
