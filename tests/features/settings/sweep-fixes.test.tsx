// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type SaveAnswer, type SaveValues } from "@/features/settings";
import { buildBrand } from "../../../src/features/brand/api/build-brand";
import { shadowedKeys } from "../../../src/features/settings/api/fields";
import { filterSettings } from "../../../src/features/settings/api/search";
import { initialState, prepareSave, settingsReducer } from "../../../src/features/settings/api/state";
import { validateValues } from "../../../src/features/settings/api/validate";

afterEach(cleanup);

const saved = (results: { key: string; status: "saved" }[]): SaveAnswer => ({ kind: "results", results });

describe("S1: contrast with a stored 3-digit color", () => {
  it("stops an unreadable pair", () => {
    expect(validateValues({ main_color: "#EEEEEE", text_on_main_color: "#fff" }, { main_color: "#111111", text_on_main_color: "#fff" })?.key).toBe("main_color");
  });
  it("lets a readable pair through", () => {
    expect(validateValues({ main_color: "#222222", text_on_main_color: "#fff" }, { main_color: "#111111", text_on_main_color: "#fff" })).toBeNull();
  });
});

describe("S2: values that did not load", () => {
  it("says so on a live page and blocks Save, instead of claiming the account holds them", () => {
    render(<PageStateProvider><SettingsPage initialValues={{}} initialSection="biz" saveValues={vi.fn()} /></PageStateProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Your details did not load");
    expect(screen.queryByText("Your account has these values.")).toBeNull();
    expect(screen.getByRole("button", { name: "Save Business" })).toBeDisabled();
  });

  it("does not stick: values that load on a later visit replace the empty ones and keep what was typed", async () => {
    const tree = (values: Record<string, string>, on: boolean) => (
      <PageStateProvider>{on ? <SettingsPage initialValues={values} initialSection="biz" saveValues={vi.fn()} /> : null}</PageStateProvider>
    );
    const view = render(tree({}, true));
    await userEvent.setup().type(screen.getByLabelText(/^Owner name/), "Typed");
    view.rerender(tree({}, false));
    view.rerender(tree({ business_name: "Test Co", business_owner_name: "Stored" }, true));
    await waitFor(() => expect(screen.getByLabelText(/^Business name/)).toHaveValue("Test Co"));
    expect(screen.getByLabelText(/^Owner name/)).toHaveValue("Typed");
    expect(screen.getByRole("button", { name: "Save Business" })).toBeEnabled();
  });
});

describe("S6: Main city and State follow the key the reader uses", () => {
  const readerCity = (values: Record<string, string>) => buildBrand(Object.entries(values).map(([key, value]) => ({ key, value }))).profile.city;

  it("hides the key the reader ignores, for each mix of keys", () => {
    const cases: { values: Record<string, string>; hidden: string }[] = [
      { values: { business_address_city: "A", business_main_city: "B" }, hidden: "business_main_city" },
      { values: { business_address_city: "A" }, hidden: "business_main_city" },
      { values: { business_address_city: "  ", business_main_city: "B" }, hidden: "business_address_city" },
    ];
    for (const { values, hidden } of cases) {
      expect(shadowedKeys(values).has(hidden)).toBe(true);
      const shown = ["business_address_city", "business_main_city"].find((k) => k !== hidden) as string;
      expect(readerCity(values)).toBe(values[shown]);
    }
  });

  it("does the same for State, and hides nothing when the account has neither key", () => {
    expect(shadowedKeys({ business_address_state: "OH", business_main_state_abbreviation: "KY" }).has("business_main_state_abbreviation")).toBe(true);
    expect(shadowedKeys({}).size).toBe(0);
  });

  it("shows one city field, and the search does not find the hidden one", () => {
    const values = { business_address_city: "Testville", business_main_city: "Old" };
    render(<PageStateProvider><SettingsPage initialValues={values} initialSection="biz" /></PageStateProvider>);
    expect(document.getElementById("cv-business_address_city")).not.toBeNull();
    expect(document.getElementById("cv-business_main_city")).toBeNull();
    const filter = filterSettings("main city", ["business_address_city"], {}, shadowedKeys(values));
    expect(filter.items["cv-business_main_city"]).toBeFalsy();
  });
});

describe("S8: every link field gets the https fix", () => {
  it.each(["business_website_url", "request_a_job_booking_link", "request_a_quote_booking_link", "business_google_profile_url", "google_review_request_url", "bbb_review_request_url"])("%s", (key) => {
    const out = prepareSave({ values: { [key]: "" }, draft: { [key]: "example.test/page" } });
    expect(out.trimmed[key]).toBe("https://example.test/page");
    expect(out.problem).toBeNull();
  });

  it("refuses http:// next to the field", () => {
    const out = prepareSave({ values: { business_website_url: "" }, draft: { business_website_url: "http://example.test" } });
    expect(out.problem?.key).toBe("business_website_url");
  });
});

describe("U1: a stored value with a stray space", () => {
  it("reads as saved after a good save", async () => {
    const send = vi.fn<SaveValues>(async () => saved([{ key: "business_phone_number", status: "saved" }]));
    render(<PageStateProvider><SettingsPage initialValues={{ business_name: " Test Co ", business_phone_number: "111" }} initialSection="biz" saveValues={send} /></PageStateProvider>);
    const user = userEvent.setup();
    const phone = screen.getByLabelText(/^Phone/);
    await user.clear(phone);
    await user.type(phone, "222");
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    await waitFor(() => expect(document.querySelector(".fd-okl")).not.toHaveClass("is-off"));
    expect(screen.getByText("Your account has these values.")).toBeInTheDocument();
  });
});

describe("U5: View as client", () => {
  it("has read-only fields and gives no instruction it blocks", () => {
    render(<PageStateProvider><SettingsPage initialValues={{ business_name: "Test Co", main_color: "#112233" }} initialSection="colors" readOnly /></PageStateProvider>);
    expect(screen.getByLabelText(/^Main color/)).toHaveAttribute("readonly");
    const text = document.body.textContent ?? "";
    for (const blocked of ["press Apply", "Changes last until", "Change the brand colors", "Changes here do not reach"]) expect(text).not.toContain(blocked);
    expect(text).toContain("You are viewing this account. Nothing can be changed here.");
  });
});

describe("U6: the save status across navigation", () => {
  const tree = (send: SaveValues, on: boolean) => (
    <PageStateProvider>{on ? <SettingsPage initialValues={{ business_phone_number: "111" }} initialSection="biz" saveValues={send} /> : null}</PageStateProvider>
  );

  it("keeps Saving and then the failure when the owner leaves and comes back", async () => {
    let finish: (answer: SaveAnswer) => void = () => {};
    const send = vi.fn<SaveValues>(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(tree(send, true));
    const user = userEvent.setup();
    const phone = screen.getByLabelText(/^Phone/);
    await user.clear(phone);
    await user.type(phone, "222");
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    view.rerender(tree(send, false));
    view.rerender(tree(send, true));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    view.rerender(tree(send, false));
    await act(async () => finish({ kind: "failed" }));
    view.rerender(tree(send, true));
    expect(screen.getByText("Could not save. Nothing new was confirmed. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Business" })).toBeEnabled();
  });

  it("the reducer starts with no save running", () => {
    const start = initialState({ business_name: "Test Co" });
    expect(start.saving).toBe(false);
    expect(settingsReducer(start, { type: "saveStart" }).saving).toBe(true);
  });
});
