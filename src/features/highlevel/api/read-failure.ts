// What a failed read tells the customer, from the HTTP status. A 401 means HighLevel rejected the
// token, so reconnecting can help. The docs in this repo define no 403 that means a missing or
// expired grant (only WORKFLOW_API_NOT_ENABLED_FOR_LOCATION, handled by the workflow reader), so a
// 403 never promises that reconnecting will fix it.
export function readFailureReason(status: number | null): "reconnect" | "unavailable" {
  return status === 401 ? "reconnect" : "unavailable";
}
