import { oauthCallbackRoute } from "@/features/highlevel";
import { getGuards } from "@/features/auth";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => oauthCallbackRoute(request, getGuards());
