import { syncRoute } from "@/features/onboarding";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel's daily cron (vercel.json) calls GET as a backstop. Every call sends
// `Authorization: Bearer <CRON_SECRET>`.
export const POST = syncRoute;
export const GET = syncRoute;
