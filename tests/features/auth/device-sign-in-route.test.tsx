import { beforeEach, describe, expect, it, vi } from "vitest";

// The /device-sign-in route (server part). A cookie already on this device must never stop a handoff
// or pairing token from being redeemed: the framed /embed sign-in leaves a one-day "do not remember"
// cookie that the top window also sends (browsers that allow third-party cookies), and a pairing link
// may be opened where someone else is signed in. So the server never redirects; the page decides in
// the browser, where the token (in the fragment) is visible.
const { getRequestUser, redirect, DeviceSignIn, maskEmailHint } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  DeviceSignIn: vi.fn(() => null),
  maskEmailHint: vi.fn((email: string) => `${email[0]}•••@${email.split("@")[1]}`),
}));

vi.mock("../../../src/app/session", () => ({ getRequestUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/features/auth", () => ({ DeviceSignIn, maskEmailHint }));

import Page from "../../../src/app/device-sign-in/page";

type El = { type: unknown; props: { signedIn?: boolean; currentPerson?: string | null } };

beforeEach(() => vi.clearAllMocks());

describe("/device-sign-in route", () => {
  it("shows the redeem page to a visitor who is not signed in", async () => {
    getRequestUser.mockResolvedValue(null);
    const el = (await Page()) as El;
    expect(el.type).toBe(DeviceSignIn);
    expect(el.props.signedIn).toBe(false);
    expect(el.props.currentPerson).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("passes only the masked email of whoever is signed in here", async () => {
    getRequestUser.mockResolvedValue({ id: "u1", email: "mary.full@outlook.com", tenantId: "T1", role: "owner" });
    const el = (await Page()) as El;
    expect(el.props.currentPerson).toBe("m•••@outlook.com");
    expect(JSON.stringify(el.props)).not.toContain("mary.full");
  });

  it("does not redirect a visitor who already has a session (remembered, framed do-not-remember, or another user)", async () => {
    for (const user of [
      { id: "u1", tenantId: "T1", role: "owner" },
      { id: "u2", tenantId: "T2", role: "office" },
    ]) {
      getRequestUser.mockResolvedValue(user);
      const el = (await Page()) as El;
      expect(el.type).toBe(DeviceSignIn);
      expect(el.props.signedIn).toBe(true);
    }
    expect(redirect).not.toHaveBeenCalled();
  });
});
