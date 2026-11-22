import { describe, expect, it, vi } from "vitest";
import { buildBusiness, businessValues, createSendController, patchBusiness, pickPatch, SEND_SECONDS, type BusinessPatch } from "@/features/app-shell";

function controllerWithClock() {
  const waits: Array<{ fn: () => void; ms: number }> = [];
  const onDone = vi.fn();
  const onClose = vi.fn();
  const onChange = vi.fn();
  const controller = createSendController({
    onDone, onClose, onChange,
    schedule: (fn, ms) => { waits.push({ fn, ms }); return () => {}; },
  });
  const flush = () => { for (const w of waits.splice(0)) w.fn(); };
  const runOut = () => { for (let i = 0; i < SEND_SECONDS + 3; i += 1) controller.tick(); };
  return { waits, onDone, onClose, onChange, controller, flush, runOut };
}

describe("send controller pins", () => {
  it("waits 300 ms on 0 before the send runs (the design's beat)", () => {
    const c = controllerWithClock();
    c.runOut();
    expect(c.waits.at(-1)?.ms).toBe(300);
  });

  it("Cancel at 0 closes exactly once, also after the fire wait runs", () => {
    const c = controllerWithClock();
    c.runOut();
    c.controller.cancel();
    c.flush();
    expect(c.onClose).toHaveBeenCalledTimes(1);
    expect(c.onDone).not.toHaveBeenCalled();
  });

  it("after Cancel a tick changes nothing and tells no listener", () => {
    const c = controllerWithClock();
    c.controller.tick();
    const n = c.controller.state().n;
    const calls = c.onChange.mock.calls.length;
    c.controller.cancel();
    c.controller.tick();
    c.controller.tick();
    expect(c.controller.state().n).toBe(n);
    expect(c.onChange).toHaveBeenCalledTimes(calls);
  });
});

describe("business pins", () => {
  const base = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee", phone: "+1 555 0100", logoUrl: "https://assets.example.test/l.svg" });

  it("a patch with a number or an object does not throw and blanks the field", () => {
    const b = patchBusiness(base, { phone: 123, logoUrl: {} } as unknown as BusinessPatch);
    expect(b.phone).toBe("");
    expect(b.logoUrl).toBeNull();
  });

  it("pickPatch keeps only the fields a patch may set", () => {
    expect(pickPatch({ name: "A", init: "ZZ", evil: 1 } as unknown as BusinessPatch)).toStrictEqual({ name: "A" });
    expect(patchBusiness(base, pickPatch({ email: "a@b.test" })).name).toBe("Sample Roofing");
    expect(patchBusiness(base, pickPatch({ email: "a@b.test" })).phone).toBe("+1 555 0100");
  });

  it("a blank owner in a patch keeps the signed-in person's name (no 'Owner / Owner' after Save)", () => {
    expect(patchBusiness(base, { owner: "" }).owner).toBe("Pat Lee");
    expect(patchBusiness(base, { owner: "   " }).first).toBe("Pat");
    expect(patchBusiness(base, { owner: null } as unknown as BusinessPatch).owner).toBe("Pat Lee");
    expect(patchBusiness(base, { owner: "Sam Ortiz" }).owner).toBe("Sam Ortiz");
  });

  it("carries the county under business_main_county, blank when missing", () => {
    const b = buildBusiness({ city: "Columbus", county: " Franklin County " });
    expect(b.county).toBe("Franklin County");
    expect(businessValues(b).business_main_county).toBe("Franklin County");
    expect(businessValues(buildBusiness({})).business_main_county).toBe("");
    expect(patchBusiness(b, { county: "" }).county).toBe("");
    expect(patchBusiness(b, { city: "Dayton" }).county).toBe("Franklin County");
  });

  it("carries the seasonal offer and the referral reward under their custom-value keys", () => {
    const b = buildBusiness({ seasonalOfferText: " Fall checks ", referralRewardText: "$25 off" });
    expect(businessValues(b)).toMatchObject({ seasonal_offer_text: "Fall checks", referral_reward_text: "$25 off" });
    expect(businessValues(buildBusiness({}))).toMatchObject({ seasonal_offer_text: "", referral_reward_text: "" });
    const patched = patchBusiness(b, { seasonalOffer: "Spring", referralReward: "" });
    expect(businessValues(patched)).toMatchObject({ seasonal_offer_text: "Spring", referral_reward_text: "" });
    expect(patchBusiness(b, {})).toEqual(b);
  });
});
