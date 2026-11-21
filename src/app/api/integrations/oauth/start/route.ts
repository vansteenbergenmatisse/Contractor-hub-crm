import { oauthStartRoute } from "@/features/highlevel";
import { getGuards } from "@/features/auth";

export const dynamic = "force-dynamic";
// Only a signed-in Forge Forward admin may start an install; the admin id is bound into the state.
export const GET = (request: Request) => oauthStartRoute(request, getGuards());
