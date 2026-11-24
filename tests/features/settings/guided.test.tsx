// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type SaveValues, type ValueChange } from "@/features/settings";
import { chunkChanges } from "../../../src/features/settings/hooks/use-save-values";

afterEach(cleanup);

// Made-up values only.
const VALUES: Record<string, string> = {
  business_name: "Test Co",
  business_phone_number: "111",
  business_email: "a@b.example",
  business_address: "1 Test St",
  business_hours_weekdays_open: "08:00",
  seasonal_offer_text: "Old offer",
  "1_our_work_before": "https://assets.example/a.png",
  business_facebook_url: "",
  google_review_request_url: "https://review.example/x",
  request_a_job_booking_link: "https://book.example/job",
  main_color: "#112233",
  residentialservice1: "Service one",
  residentialservice2: "",
};
const allSaved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });
const page = (extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}, values = VALUES) =>
  render(<PageStateProvider><SettingsPage initialValues={values} {...extra} /></PageStateProvider>);
const card = (id: string) => within(document.getElementById(`s-card-${id}`) as HTMLElement);

describe("the guided structure", () => {
  // Changed 2026-11-24: one step per HighLevel folder that holds a value (layout.ts), so the count
  // follows the account. These values fill six folders (Business, Social, Google, Booking, Colors, Our work).
  it("has three tabs and one step per folder with values, in order", () => {
    page();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Your details", "Connections", "Your choices"]);
    // Review fix: the step cards on screen, not arrangeSteps' own answer.
    const titles = [...document.querySelectorAll(".ga-stack > [id^='s-card-'] h2")].map((h) => h.textContent);
    expect(titles).toEqual(["Business", "Social links", "Google Business Profile", "Booking links", "Brand colors", "Our work"]);
    expect(screen.getByRole("heading", { level: 2, name: "Business" })).toBeInTheDocument();
    expect(screen.getByText("Step 6 of 6")).toBeInTheDocument();
  });

  it("switches tabs", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("tab", { name: "Connections" }));
    expect(screen.getByRole("tab", { name: "Connections" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  });

  // Changed 2026-11-24: Business holds its folder's sub-groups (layout.ts), each with a heading;
  // a folder with one sub-group on screen stays one grid without a heading.
  it("shows Business in its sub-groups, and a one-group folder as one grid without subheadings", () => {
    page();
    const biz = document.getElementById("s-card-biz") as HTMLElement;
    expect([...biz.querySelectorAll("h3.ga-sg")].map((h) => h.textContent)).toEqual(["Name and contact", "Address", "Hours", "Logo and images", "Call to action", "Offers"]);
    const soc = document.getElementById("s-card-soc") as HTMLElement;
    expect(soc.querySelectorAll(".sv-fields")).toHaveLength(1);
    expect(soc.querySelectorAll("fieldset, legend, h3, .ga-sg")).toHaveLength(0);
  });

  // Changed 2026-11-24: Our work is its own folder step; hours sit in Business.
  it("keeps Our work images and the structured hours keys visible", () => {
    page();
    expect(card("work").getByLabelText("Project 1, before")).toBeInTheDocument();
    expect(card("biz").getByLabelText(/^Business hours weekdays open/)).toHaveValue("08:00");
  });

  it("omits the place id, the keys switch and the geocode button", () => {
    page({}, { ...VALUES, google_place_id: "secret-place" });
    expect(document.body.textContent).not.toContain("secret-place");
    expect(document.getElementById("cv-google_place_id")).toBeNull();
    expect(screen.queryByRole("switch", { name: /keys/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /coordinates|geocode/i })).toBeNull();
  });

  it("shows no custom value key names to the owner", () => {
    page();
    const text = document.body.textContent ?? "";
    for (const name of ["business_name", "custom_values", "01_Business_essentials", "03.1_Residential"]) expect(text).not.toContain(name);
  });

  it("counts progress from the saved values", () => {
    page({ account: { imageHosts: [] } });
    // Changed 2026-11-24 (review fix): a fixed number, not one worked out with the functions under test.
    expect(screen.getByText("10 of 11 filled")).toBeInTheDocument();
  });

  it("filters to empty fields with the switch", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("switch", { name: "Only show empty fields" }));
    expect(document.getElementById("cv-business_name")).toBeNull();
    expect(document.getElementById("cv-business_facebook_url")).not.toBeNull();
  });

  it("shows choices without a backend as Not available yet, with no switch", () => {
    page({ initialSection: "choice" });
    expect(screen.getByText("Approve every quote before it goes out")).toBeVisible();
    expect(screen.getAllByRole("switch", { hidden: true }).map((s) => s.getAttribute("aria-label"))).toEqual(["Only show empty fields"]);
  });
});

describe("per-step save", () => {
  it("sends only the step's own changes and keeps another step's edit", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await user.type(screen.getByLabelText(/^Phone/), "2");
    await user.type(screen.getByLabelText(/^Facebook/), "b");
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toEqual([{ key: "business_phone_number", expected: "111", value: "1112" }]);
    // Changed 2026-11-24: the address is now in the Business step, so the other step is Social links.
    expect(screen.getByLabelText(/^Facebook/)).toHaveValue("b");
  });

  it("does not let a bad value in another step stop this save", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await user.clear(screen.getByLabelText(/^Main color/));
    await user.type(screen.getByLabelText(/^Main color/), "blue");
    await user.type(screen.getByLabelText(/^Phone/), "2");
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it("Cancel puts back only that step", async () => {
    const user = userEvent.setup();
    page({ saveValues: vi.fn(allSaved) });
    await user.type(screen.getByLabelText(/^Phone/), "2");
    await user.type(screen.getByLabelText(/^Facebook/), "b");
    await user.click(screen.getByRole("button", { name: "Cancel Business" }));
    expect(screen.getByLabelText(/^Phone/)).toHaveValue("111");
    // Changed 2026-11-24: the address is now in the Business step, so the other step is Social links.
    expect(screen.getByLabelText(/^Facebook/)).toHaveValue("b");
  });
});

describe("clearing a value", () => {
  it("asks first, sends nothing until confirmed, then marks the clear", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await user.clear(screen.getByLabelText(/^Seasonal offer text/));
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("Check before you clear")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear and save" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toEqual([{ key: "seasonal_offer_text", expected: "Old offer", value: "", clear: true }]);
  });

  it("Go back sends nothing", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await user.clear(screen.getByLabelText(/^Seasonal offer text/));
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByText("Check before you clear")).toBeNull();
  });

  it("never offers to clear the business name", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await user.clear(screen.getByLabelText(/^Business name/));
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    expect(screen.queryByText("Check before you clear")).toBeNull();
    expect(screen.getByText("Enter the business name.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("protected folders", () => {
  const unlock = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
  };

  it("is read-only until unlocked, and Unlock needs the tick", async () => {
    const user = userEvent.setup();
    page({ saveValues: vi.fn(allSaved) });
    expect(screen.getByLabelText("Residential service 1")).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.getByLabelText("Residential service 1")).not.toHaveAttribute("readonly");
  });

  it("unlocks one folder at a time", async () => {
    const user = userEvent.setup();
    page({ saveValues: vi.fn(allSaved) }, { ...VALUES, commercialservice1: "Com" });
    await unlock(user);
    expect(screen.getByRole("button", { name: "Unlock Commercial services to change" })).toBeDisabled();
  });

  it("saves only after the check step, then locks again", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await unlock(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("Residential service 2: (empty) to New")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("Residential service 2")).toHaveAttribute("readonly"));
  });

  it("marks a clear made in the folder after the check step", async () => {
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send });
    await unlock(user);
    await user.clear(screen.getByLabelText("Residential service 1"));
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toEqual([{ key: "residentialservice1", expected: "Service one", value: "", clear: true }]);
  });

  it("Lock without saving puts the names back", async () => {
    const user = userEvent.setup();
    page({ saveValues: vi.fn(allSaved) });
    await unlock(user);
    await user.type(screen.getByLabelText("Residential service 1"), "x");
    await user.click(screen.getByRole("button", { name: "Lock without saving" }));
    expect(screen.getByLabelText("Residential service 1")).toHaveValue("Service one");
    expect(screen.getByLabelText("Residential service 1")).toHaveAttribute("readonly");
  });

  it("stays open and says so when the save fails", async () => {
    const user = userEvent.setup();
    page({ saveValues: vi.fn<SaveValues>(async () => ({ kind: "failed" })) });
    await unlock(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await act(async () => { await user.click(screen.getByRole("button", { name: "Save Residential services" })); });
    expect(await screen.findByText("Could not save. Nothing new was confirmed. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Residential service 2")).not.toHaveAttribute("readonly");
  });

  it("offers no unlock in View as client", () => {
    page({ readOnly: true });
    expect(screen.queryByRole("button", { name: /Unlock/ })).toBeNull();
    expect(screen.getByLabelText("Residential service 1")).toHaveAttribute("readonly");
  });

  it("splits more than 20 changes into sequential saves", async () => {
    const values = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i === 0 ? "bizarea00maincity" : `bizarea${i + 1 > 9 ? i + 1 : `0${i + 1}`}`, ""]));
    const send = vi.fn(allSaved);
    const user = userEvent.setup();
    page({ saveValues: send }, { business_name: "Test Co", ...values });
    await user.click(screen.getByRole("button", { name: "Unlock Service areas to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    const folder = within(document.getElementById("s-card-area") as HTMLElement);
    for (const input of folder.getAllByRole("textbox")) await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Service areas" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.map(([part]) => part.length)).toEqual([20, 1]);
  });

  it("chunks by the server cap", () => {
    const changes: ValueChange[] = Array.from({ length: 45 }, (_, i) => ({ key: `k${i}`, expected: "", value: "v" }));
    expect(chunkChanges(changes).map((part) => part.length)).toEqual([20, 20, 5]);
  });

  it("stops at a failed part and says part of it saved", async () => {
    const values = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i === 0 ? "bizarea00maincity" : `bizarea${i + 1 > 9 ? i + 1 : `0${i + 1}`}`, ""]));
    const send = vi.fn<SaveValues>().mockImplementationOnce(allSaved).mockResolvedValueOnce({ kind: "limited" });
    const user = userEvent.setup();
    page({ saveValues: send }, { business_name: "Test Co", ...values });
    await user.click(screen.getByRole("button", { name: "Unlock Service areas to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    const folder = within(document.getElementById("s-card-area") as HTMLElement);
    for (const input of folder.getAllByRole("textbox")) await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Service areas" }));
    expect(await screen.findByText(/Some changes were saved, the rest were not\./)).toBeInTheDocument();
  });
});
