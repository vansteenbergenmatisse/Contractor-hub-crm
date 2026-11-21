import { describe, expect, it } from "vitest";
import { loginState, statusLabel, toClientRow } from "@/features/admin";

describe("statusLabel", () => {
  it("uses the three words of the spec", () => {
    expect(statusLabel("connected")).toBe("Connected");
    expect(statusLabel("needs_reconnect")).toBe("Needs reconnect");
    expect(statusLabel("uninstalled")).toBe("Uninstalled");
  });
});

describe("loginState", () => {
  it("is 'no users' with none, 'on' when any user can sign in, 'off' when all are disabled", () => {
    expect(loginState(0, 0)).toBe("no users");
    expect(loginState(2, 1)).toBe("on");
    expect(loginState(2, 0)).toBe("off");
  });
});

describe("toClientRow", () => {
  it("maps a tenant and its user counts, with a fallback name", () => {
    const row = toClientRow({ id: "t1", name: null, locationId: "loc_1", status: "needs_reconnect" }, 3, 2);
    expect(row).toEqual({
      tenantId: "t1",
      name: "loc_1",
      status: "Needs reconnect",
      login: "on",
      users: 3,
    });
  });
});
