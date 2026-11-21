import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient, HighLevelHttpError } from "@/features/highlevel";

// Shape from HighLevel's OpenAPI file (apps/locations.json, GET /locations/{locationId}/customValues),
// not yet seen on a real response. Values are fake.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HighLevel client: listCustomValues", () => {
  it("calls GET /locations/{id}/customValues with the bearer token and the 2021-07-28 version", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ customValues: [] }));
    await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "loc_1");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hl.example.test/locations/loc_1/customValues");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28" });
  });

  it("encodes the location id in the path", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ customValues: [] }));
    await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "a/b?c");
    expect(fetch.mock.calls[0][0]).toBe("https://hl.example.test/locations/a%2Fb%3Fc/customValues");
  });

  it("maps fieldKey '{{ custom_values.main_color }}' to the key 'main_color' and keeps the value", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        customValues: [
          { id: "1", name: "Main Color", fieldKey: "{{ custom_values.main_color }}", value: "#112233", locationId: "loc_1" },
          { id: "2", name: "Logo", fieldKey: "{{custom_values.business_logo}}", value: "https://x.test/l.png", locationId: "loc_1" },
        ],
      }),
    );
    const values = await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "loc_1");
    expect(values).toEqual([
      { key: "main_color", value: "#112233" },
      { key: "business_logo", value: "https://x.test/l.png" },
    ]);
  });

  it("drops entries without a usable key or a string value", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        customValues: [
          { fieldKey: "not a key", value: "x" },
          { fieldKey: "{{ custom_values.a }}", value: 5 },
          { fieldKey: "{{ custom_values.b }}" },
          null,
          { fieldKey: "{{ custom_values.ok }}", value: "fine" },
        ],
      }),
    );
    expect(await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "l")).toEqual([
      { key: "ok", value: "fine" },
    ]);
  });

  it.each([
    "x{{ custom_values.a }}",
    "{{ custom_values.a }}x",
    "{{ custom_values.a-b }}",
    "{{ custom_values.a.b }}",
    "{{ other.a }}",
    "{{ custom_values. }}",
  ])("ignores a fieldKey that is not exactly one custom value: %s", async (fieldKey) => {
    const fetch = vi.fn().mockResolvedValue(json({ customValues: [{ fieldKey, value: "v" }] }));
    expect(await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "l")).toEqual([]);
  });

  it("throws on an unexpected body and carries the status on an error, never the body", async () => {
    const bad = vi.fn().mockResolvedValue(json({ nope: true }));
    await expect(createHighLevelClient({ ...config, fetch: bad }).listCustomValues("tok", "l")).rejects.toThrow(/unexpected/);
    const denied = vi.fn().mockResolvedValue(json({ secret: "leak-me" }, 401));
    const error = await createHighLevelClient({ ...config, fetch: denied }).listCustomValues("tok", "l").catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBe(401);
    expect(String(error.message)).not.toContain("leak-me");
  });
});
