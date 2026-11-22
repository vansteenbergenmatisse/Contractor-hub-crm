import { cache } from "react";
import { headers } from "next/headers";
import { currentUserFromHeaders } from "@/features/auth";

// The signed-in user of this request, looked up once per request however many layouts, pages and
// metadata functions ask (each lookup also checks the tenant's status in the database).
export const getRequestUser = cache(async () => currentUserFromHeaders(await headers()));
