import { parseRetryAfter } from "@/shared/lib/retry-after";
import { ALERT_CATEGORIES, ALERT_CHANNELS } from "../types";
import type { AlertResult, FailedSendAlert, FailedSendAlerter } from "../types";

const THROTTLE_MS = 15 * 60_000;
const FAILURE_WAIT_MS = 60_000;
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 24 * 3600;
const MAX_COUNT = 1_000_000;
const MAX_TRACKED_KEYS = 1000;
const TIMEOUT_MS = 5000;

// Strict formats, so a name, phone, email or message put in the wrong field is refused.
const TENANT_ID = /^c[a-z0-9]{24}$/;
const CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Entry = { nextAt: number; pending: number };

export type AlerterConfig = {
  webhookUrl: string | undefined;
  appUrl: string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
};

function warn(message: string): void {
  try {
    console.warn(message);
  } catch {
    // Logging must never reach the caller.
  }
}

function safeWebhookUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    const ok =
      url.protocol === "https:" &&
      url.hostname === "hooks.slack.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith("/services/");
    return ok ? url.href : null;
  } catch {
    return null;
  }
}

function adminLink(appUrl: string | undefined): string | null {
  try {
    const url = new URL(appUrl?.trim() ?? "");
    return url.protocol === "https:" ? `${url.origin}/admin/clients` : null;
  } catch {
    return null;
  }
}

// Copies only the allowed fields, so anything extra on the input cannot reach Slack.
function parseAlert(input: FailedSendAlert): FailedSendAlert | null {
  if (typeof input !== "object" || input === null) return null;
  const { tenantId, channel, category, count, correlationId } = input;
  if (typeof tenantId !== "string" || !TENANT_ID.test(tenantId)) return null;
  if (typeof correlationId !== "string" || !CORRELATION_ID.test(correlationId)) return null;
  if (!ALERT_CHANNELS.includes(channel) || !ALERT_CATEGORIES.includes(category)) return null;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;
  return { tenantId, channel, category, count, correlationId };
}

function formatAlert(alert: FailedSendAlert, link: string | null): string {
  const lines = [
    "Failed send",
    `Tenant: ${alert.tenantId}`,
    `Channel: ${alert.channel}`,
    `Error: ${alert.category}`,
    `Count: ${alert.count}`,
    `Correlation: ${alert.correlationId}`,
  ];
  if (link) lines.push(`Admin: ${link}`);
  return lines.join("\n");
}

export function createFailedSendAlerter(config: AlerterConfig): FailedSendAlerter {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const webhookUrl = safeWebhookUrl(config.webhookUrl);
  const link = adminLink(config.appUrl);
  // In memory, so each server instance throttles on its own and a restart clears it.
  const entries = new Map<string, Entry>();
  let blockedUntil = 0;

  function hold(key: string, count: number, at: number): void {
    const entry = entries.get(key);
    if (entry) {
      entry.pending = Math.min(entry.pending + count, MAX_COUNT);
      return;
    }
    if (!hasRoom(at)) return;
    entries.set(key, { nextAt: blockedUntil, pending: count });
  }

  function hasRoom(at: number): boolean {
    if (entries.size < MAX_TRACKED_KEYS) return true;
    for (const [key, entry] of entries) if (entry.nextAt <= at) entries.delete(key);
    return entries.size < MAX_TRACKED_KEYS;
  }

  function recordFailure(entry: Entry, count: number, waitUntil: number): void {
    entry.pending = Math.min(entry.pending + count, MAX_COUNT);
    entry.nextAt = waitUntil;
  }

  async function post(alert: FailedSendAlert, entry: Entry, url: string): Promise<AlertResult> {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: formatAlert(alert, link) }),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      recordFailure(entry, alert.count, now() + FAILURE_WAIT_MS);
      warn("Failed-send alert: Slack could not be reached.");
      return { status: "failed" };
    }
    // The body is never read: it could echo something that must not reach the log.
    void response.body?.cancel().catch(() => {});
    if (response.ok) return { status: "sent" };

    const at = now();
    let waitUntil = at + FAILURE_WAIT_MS;
    if (response.status === 429) {
      const seconds = parseRetryAfter(response.headers.get("retry-after"), at) ?? DEFAULT_RETRY_AFTER_SECONDS;
      blockedUntil = Math.max(blockedUntil, at + Math.min(seconds, MAX_RETRY_AFTER_SECONDS) * 1000);
      waitUntil = Math.max(waitUntil, blockedUntil);
    }
    recordFailure(entry, alert.count, waitUntil);
    warn(`Failed-send alert: Slack refused the alert (status ${response.status}).`);
    return { status: "failed" };
  }

  return {
    trackedKeys: () => entries.size,
    async alert(input) {
      try {
        if (!webhookUrl) return { status: "disabled" };
        const alert = parseAlert(input);
        if (!alert) return { status: "invalid" };

        const at = now();
        const key = `${alert.tenantId}:${alert.category}`;
        const existing = entries.get(key);
        if (at < blockedUntil || (existing && at < existing.nextAt)) {
          hold(key, alert.count, at);
          return { status: "throttled" };
        }

        // Claimed before the await, so calls arriving together send one alert.
        const count = Math.min(alert.count + (existing?.pending ?? 0), MAX_COUNT);
        if (!existing && !hasRoom(at)) return { status: "throttled" };
        const entry: Entry = { nextAt: at + THROTTLE_MS, pending: 0 };
        entries.set(key, entry);
        return await post({ ...alert, count }, entry, webhookUrl);
      } catch {
        warn("Failed-send alert: could not be processed.");
        return { status: "failed" };
      }
    },
  };
}

export function createFailedSendAlerterFromEnv(
  env: Record<string, string | undefined> = process.env,
  deps: Pick<AlerterConfig, "fetch" | "now"> = {},
): FailedSendAlerter {
  return createFailedSendAlerter({ webhookUrl: env.SLACK_FAILED_SEND_WEBHOOK_URL, appUrl: env.APP_URL, ...deps });
}

let instance: FailedSendAlerter | undefined;

// One shared instance, because the throttle lives in its memory.
export function getFailedSendAlerter(): FailedSendAlerter {
  instance ??= createFailedSendAlerterFromEnv();
  return instance;
}
