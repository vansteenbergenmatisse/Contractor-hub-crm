import { checkSubAccountsRoute } from "@/features/onboarding";

export const dynamic = "force-dynamic";
// The reconcile runs inside the request (it has its own 35-second budget).
export const maxDuration = 60;

// Admin only, same origin: connect the sub-accounts HighLevel lists as having the app, now.
export const POST = (request: Request) => checkSubAccountsRoute(request);
