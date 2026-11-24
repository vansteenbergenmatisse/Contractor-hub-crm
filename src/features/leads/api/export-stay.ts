// Lets the export form stay on the page. A form post answered with 204 does not navigate, and a file
// download does not either, so hand-added leads and drafts survive. Neither answer reaches the page,
// so a short-lived cookie holding only the result tells the panel the export ended.
export const STAY_ACTION = "/api/leads/export?respond=stay";
export const RESULT_COOKIE = "leads-export-result";
// SameSite=None because the app runs inside HighLevel's cross-site iframe, as the session cookie does.
export const RESULT_COOKIE_ATTRIBUTES = "Path=/; Max-Age=60; SameSite=None; Secure";

export const wantsStay = (request: Request) => new URL(request.url).searchParams.get("respond") === "stay";

// The id makes every answer a new value, because the browser reports no change for an identical cookie.
const resultCookie = (result: string) => `${RESULT_COOKIE}=${result}.${crypto.randomUUID()}; ${RESULT_COOKIE_ATTRIBUTES}`;

const stayed = (result: string) =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store", "set-cookie": resultCookie(result) } });

export const stayFailure = () => stayed("failed");

export function stayAnswer(response: Response): Response {
  if (response.status === 200) {
    const headers = new Headers(response.headers);
    headers.append("set-cookie", resultCookie("ok"));
    return new Response(response.body, { status: 200, headers });
  }
  if (response.status === 403) return stayed("forbidden");
  const location = response.headers.get("location");
  return stayed(location?.endsWith("export=busy") ? "busy" : "failed");
}

export const resultFromCookie = (value: string | undefined) => value?.split(".")[0] ?? "failed";
