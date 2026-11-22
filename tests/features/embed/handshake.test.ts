import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHandshake, type HandshakeDeps, type HandshakeResult } from "@/features/embed";

// The browser side of /embed with fake windows: the real logic, no DOM.
type Listener = (event: { source: unknown; data: unknown }) => void;

function setup(options: { fetchStatus?: number; fetchThrows?: boolean; embedded?: boolean } = {}) {
  const parent = { postMessage: vi.fn() };
  const self = options.embedded === false ? parent : {};
  let listener: Listener = () => {};
  const removed = vi.fn();
  const fetchImpl = vi.fn<HandshakeDeps["fetchImpl"]>(async () => {
    if (options.fetchThrows) throw new Error("offline");
    return { ok: (options.fetchStatus ?? 200) < 300, status: options.fetchStatus ?? 200 };
  });
  const results: HandshakeResult[] = [];
  const stop = startHandshake({
    parent,
    self,
    listen: (handler) => {
      listener = handler;
      return removed;
    },
    fetchImpl,
    onResult: (result) => results.push(result),
    retryEveryMs: 1000,
    giveUpAfterMs: 5000,
  });
  const answer = (data: unknown, source: unknown = parent) => listener({ source, data });
  return { parent, fetchImpl, results, answer, stop, removed };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startHandshake", () => {
  it("asks the parent window for the user data, now and again every second until it answers", () => {
    const { parent } = setup();
    expect(parent.postMessage).toHaveBeenCalledWith({ message: "REQUEST_USER_DATA" }, "*");
    vi.advanceTimersByTime(2000);
    expect(parent.postMessage).toHaveBeenCalledTimes(3);
  });

  it("sends the encrypted payload to the server and reports signed_in on success", async () => {
    const { answer, fetchImpl, results } = setup();
    answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher", region: "x" });
    await vi.waitFor(() => expect(results).toEqual(["signed_in"]));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/auth/embed-login");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(JSON.parse(init.body)).toEqual({ payload: "cipher" });
  });

  it("stops asking once it has an answer, and only sends one request", async () => {
    const { answer, parent, fetchImpl, results } = setup();
    answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" });
    answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" });
    await vi.waitFor(() => expect(results.length).toBe(1));
    vi.advanceTimersByTime(3000);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ignores an answer that does not come from the parent window", () => {
    const { answer, fetchImpl } = setup();
    answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" }, { other: "window" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ignores other messages and a response without a string payload", () => {
    const { answer, fetchImpl } = setup();
    for (const data of [null, "text", { message: "SOMETHING_ELSE", payload: "x" }, { message: "REQUEST_USER_DATA_RESPONSE" }, { message: "REQUEST_USER_DATA_RESPONSE", payload: 5 }, { message: "REQUEST_USER_DATA_RESPONSE", payload: "" }]) {
      answer(data);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports no_access when the server says no (403) or fails, and when the request cannot be sent", async () => {
    for (const options of [{ fetchStatus: 403 }, { fetchStatus: 500 }, { fetchThrows: true }]) {
      const { answer, results } = setup(options);
      answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" });
      await vi.waitFor(() => expect(results).toEqual(["no_access"]));
    }
  });

  it("reports no_data when the parent never answers", () => {
    const { results } = setup();
    vi.advanceTimersByTime(5000);
    expect(results).toEqual(["no_data"]);
  });

  it("reports not_embedded at once when the page is not inside another window", () => {
    const { results, parent } = setup({ embedded: false });
    expect(results).toEqual(["not_embedded"]);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it("stop() before the request settles means no result is reported afterwards", async () => {
    const { answer, stop, results, fetchImpl } = setup();
    answer({ message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" });
    stop();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();
    expect(results).toEqual([]);
  });

  it("stop removes the listener and the timers", () => {
    const { stop, removed, parent, results } = setup();
    stop();
    vi.advanceTimersByTime(10_000);
    expect(removed).toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });
});
