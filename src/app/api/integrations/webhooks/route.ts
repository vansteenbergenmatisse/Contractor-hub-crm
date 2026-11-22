import { createWebhookRoute } from "@/features/highlevel";
import { getWebhookHooks } from "@/features/onboarding";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: Request) => createWebhookRoute({ hooks: getWebhookHooks() })(request);
