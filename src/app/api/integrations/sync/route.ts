import { syncRoute } from "@/features/onboarding";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// n8n calls POST every 10 minutes; Vercel's daily cron (vercel.json) calls GET as a backup. Both send
// `Authorization: Bearer <CRON_SECRET>`.
export const POST = syncRoute;
export const GET = syncRoute;
