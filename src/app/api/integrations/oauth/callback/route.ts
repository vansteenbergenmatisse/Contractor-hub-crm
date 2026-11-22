import { oauthCallbackRoute } from "@/features/highlevel";
import { getGuards } from "@/features/auth";
import { getCallbackOnboard } from "@/features/onboarding";

export const dynamic = "force-dynamic";
// Onboarding (tenants, tokens and CRM users) needs a lot of HighLevel calls; give it the platform's
// longest allowed time on the free plan.
export const maxDuration = 60;

export const GET = (request: Request) => {
  let onboard;
  try {
    onboard = getCallbackOnboard();
  } catch {
    onboard = undefined; // incomplete env: the callback falls back to its bare token loop
  }
  return oauthCallbackRoute(request, getGuards(), onboard);
};
