import Link from "next/link";
import type { PipelineChoice } from "../types";

// Links to the tenant's pipelines. Drawn only when there is more than one to choose from.
export function PipelineSwitcher({ pipelines, current }: { pipelines: readonly PipelineChoice[]; current: string | null }) {
  if (pipelines.length < 2) return null;
  return (
    <nav aria-label="Pipelines" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {pipelines.map((p) => (
        <Link key={p.id} href={`/pipeline?pipeline=${encodeURIComponent(p.id)}`} className={p.id === current ? "fd-btn" : "fd-btn is-plain"} aria-current={p.id === current ? "page" : undefined}>
          {p.name}
        </Link>
      ))}
    </nav>
  );
}
