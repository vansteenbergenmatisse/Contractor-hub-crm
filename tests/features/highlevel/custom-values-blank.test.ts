import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient, CustomValuesNotConnectedError, listCustomValuesWithRetry } from "@/features/highlevel";

// Requirement 5: a sub-account whose custom values are all blank must show empty fields. A blank value
// that HighLevel sends as null is an empty value, not a row to drop. Values are fake.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("listCustomValues on a blank sub-account", () => {
  it("keeps a row whose value is null, as an empty value", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        customValues: [
          { id: "1", name: "Business name", fieldKey: "{{ custom_values.business_name }}", value: null },
          { id: "2", name: "Main color", fieldKey: "{{ custom_values.main_color }}", value: "" },
        ],
      }),
    );
    expect(await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "l")).toEqual([
      { key: "business_name", value: "" },
      { key: "main_color", value: "" },
    ]);
  });

  it("still drops a value of another type", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ customValues: [{ fieldKey: "{{ custom_values.a }}", value: { x: 1 } }, { fieldKey: "{{ custom_values.b }}", value: true }] }));
    expect(await createHighLevelClient({ ...config, fetch }).listCustomValues("tok", "l")).toEqual([]);
  });
});

describe("listCustomValuesWithRetry: not connected is not the same as no values", () => {
  it("rejects with a not-connected error when asked to, without asking for a token", async () => {
    const getLocationToken = vi.fn();
    const error = await listCustomValuesWithRetry(
      { getLocationToken, readLocationId: async () => null, listCustomValues: vi.fn() },
      "t1",
      { throwWhenNotConnected: true },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CustomValuesNotConnectedError);
    expect((error as { code: string }).code).toBe("not-connected");
    expect(getLocationToken).not.toHaveBeenCalled();
  });

  it("still reads a connected tenant when asked to reject a missing connection", async () => {
    const listCustomValues = vi.fn().mockResolvedValue([]);
    const out = await listCustomValuesWithRetry({ getLocationToken: async () => "tok", readLocationId: async () => "loc", listCustomValues }, "t1", { throwWhenNotConnected: true });
    expect(out).toEqual([]);
    expect(listCustomValues).toHaveBeenCalledWith("tok", "loc");
  });
});
