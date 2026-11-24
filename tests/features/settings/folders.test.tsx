// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

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
import { LINK_KEYS, SettingsPage, isSettingsKeyAllowed, labelOfKey, loadSettingsValues, settingsValuesFrom, validateValues } from "@/features/settings";
import { isSafeToWrite } from "../../../src/features/settings-write-back/api/value-rules";
import { FOLDERS, folderIdOfKey, foldersFor } from "../../../src/features/settings/api/folders";
import { initialState, settingsReducer } from "../../../src/features/settings/api/state";

afterEach(cleanup);

// Made-up values only, with the key shapes of the snapshot's folders.
const HOST = "assets.cdn.filesafe.space";
const VALUES: Record<string, string> = {
  business_name: "Test Co",
  business_email: "a@b.example",
  google_review_request_url: "https://review.example/x",
  request_a_job_booking_link: "https://book.example/job",
  main_color: "#112233",
  residentialservice1: "Test service one",
  residentialservice2: "",
  commercialservice1: "Test commercial",
  servicetype01: "Test type",
  bizarea00maincity: "Testville",
  bizarea1: "Test area",
  "1_our_work_before": `https://${HOST}/before.png`,
  "1_our_work_after": `https://${HOST}/after.png`,
};
const page = (values = VALUES, extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}) =>
  render(<PageStateProvider><SettingsPage initialValues={values} initialSection="biz" account={{ imageHosts: [HOST] }} {...extra} /></PageStateProvider>);

describe("the folder map", () => {
  it("lists the folders in HighLevel's order, under their real names", () => {
    expect(FOLDERS.map((f) => f.name)).toEqual([
      "01_Business_essentials", "01a_Social_Links", "01b_Google_Business_Profile", "01c_booking_links", "02_Branding",
      "03.1_Residential_Services", "03.2_Commercial_Services", "04_Service-Types", "05_Service-Areas-(cities)", "07.5_Our-work",
    ]);
  });

  it("places keys by pattern", () => {
    const cases: [string, string][] = [
      ["business_name", "essentials"], ["seasonal_offer_text", "essentials"], ["business_website_url", "essentials"],
      ["bbb_review_request_url", "google"], ["request_a_quote_booking_link", "booking"], ["sub_color", "branding"],
      ["residentialservice20", "residential"], ["commercialservice7", "commercial"], ["servicetype10", "service-types"],
      ["bizarea00maincounty", "areas"], ["bizarea21", "areas"], ["3_our_work_after", "our-work"],
    ];
    for (const [key, id] of cases) expect(folderIdOfKey(key), key).toBe(id);
  });

  it("orders numbered keys by number and leaves out a folder without keys", () => {
    const out = foldersFor(["residentialservice10", "residentialservice2", "business_name"]);
    expect(out.map((f) => f.folder.id)).toEqual(["essentials", "residential"]);
    expect(out[1].keys).toEqual(["residentialservice2", "residentialservice10"]);
  });

  it("gives plain labels", () => {
    expect(labelOfKey("residentialservice3")).toBe("Residential service 3");
    expect(labelOfKey("commercialservice12")).toBe("Commercial service 12");
    expect(labelOfKey("servicetype04")).toBe("Service type 4");
    expect(labelOfKey("bizarea7")).toBe("Service area 7");
    expect(labelOfKey("bizarea00maincity")).toBe("Main service city");
    expect(labelOfKey("2_our_work_before")).toBe("Project 2, before");
    expect(labelOfKey("2_our_work_after")).toBe("Project 2, after");
  });
});

describe("what may reach the browser", () => {
  it("allows display names and our-work images", () => {
    for (const key of ["residentialservice1", "residentialservice20", "commercialservice1", "servicetype01", "servicetype10", "bizarea00maincity", "bizarea00maincounty", "bizarea1", "bizarea21", "1_our_work_before", "12_our_work_after"]) {
      expect(isSettingsKeyAllowed(key), key).toBe(true);
    }
  });

  it("never allows article, path, webhook, group title or out-of-pattern keys", () => {
    for (const key of [
      "residentialservice00content", "residentialservice1content", "residentialservice1path", "commercialservice00content", "commercialservice2content",
      "commercialservice2path", "servicetype01content", "servicetype01path", "bizarea00maincitycontent", "bizarea00maincountycontent", "bizarea00maincountypath",
      "bizarea1content", "bizarea1path", "0_webhook_url_form", "0_servicetypename", "0_our_work_before", "residentialservice0", "residentialservice21",
      "servicetype1", "servicetype11", "bizarea22", "1_our_work_token", "1_our_work_before_secret", "1_our_work_beforecontent", "100_our_work_before",
    ]) {
      expect(isSettingsKeyAllowed(key), key).toBe(false);
    }
  });

  it("sends no content, path or webhook value to the page", async () => {
    const rows = [
      ...Object.entries(VALUES).map(([key, value]) => ({ key, value })),
      { key: "residentialservice1content", value: "<script>alert(1)</script>" },
      { key: "residentialservice1path", value: "residential-services/secret-path" },
      { key: "0_webhook_url_form", value: "https://hooks.example/abc" },
    ];
    const values = await loadSettingsValues("tenant_1", async () => rows);
    const sent = JSON.stringify(values);
    for (const bad of ["content", "script", "secret-path", "webhook", "hooks.example"]) expect(sent).not.toContain(bad);
  });

  it("does not render a content key passed straight in", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{ ...VALUES, residentialservice1content: "<img src=x onerror=alert(1)>", residentialservice1path: "a/b" }} />);
    expect(out).not.toContain("residentialservice1content");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("residentialservice1path");
  });

  it("renders markup in a display name as text", () => {
    const hostile = settingsValuesFrom([{ key: "residentialservice1", value: "<img src=x onerror=alert(1)>" }]);
    page({ ...hostile, business_name: "Test Co" });
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("Residential service 1")).toHaveValue("<img src=x onerror=alert(1)>");
  });

  it("holds an our-work image to the link rules in the form and the write path", () => {
    expect(LINK_KEYS).toContain("1_our_work_before");
    for (const bad of ["javascript:alert(1)", "http://x.example/a.png", "data:image/png;base64,AAAA"]) {
      expect(validateValues({ "1_our_work_before": bad }, { "1_our_work_before": "" })?.key, bad).toBe("1_our_work_before");
      expect(isSafeToWrite("1_our_work_before", bad), bad).toBe(false);
    }
    expect(isSafeToWrite("1_our_work_before", `https://${HOST}/a.png`)).toBe(true);
    expect(isSafeToWrite("residentialservice1", "<b>x</b>")).toBe(false);
    expect(isSafeToWrite("residentialservice1", "{{custom_values.0_webhook_url_form}}")).toBe(false);
  });
});

describe("collapsible folders", () => {
  it("a failed save opens the closed folder that holds the bad value", () => {
    let s = initialState(VALUES);
    s = settingsReducer(s, { type: "edit", key: "1_our_work_before", value: "http://x.example/a.png" });
    s = settingsReducer(s, { type: "save" });
    expect(s.err?.key).toBe("1_our_work_before");
    expect(s.folders["our-work"]).toBe(true);
  });

});

describe("our work images", () => {
  it("shows a preview after loading, the URL field and no upload control", async () => {
    const made: { onload: null | (() => void); src: string; referrerPolicy: string }[] = [];
    vi.stubGlobal("Image", class { onload = null; onerror = null; src = ""; referrerPolicy = ""; constructor() { made.push(this); } });
    page({ business_name: "Test Co", "1_our_work_before": `https://${HOST}/before.png`, "1_our_work_after": "https://evil.example/after.png" });
    expect(made.map((i) => i.src)).toEqual([`https://${HOST}/before.png`]);
    made[0].onload?.();
    expect(await screen.findByRole("img", { name: "Project 1, before preview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Project 1, before")).toHaveValue(`https://${HOST}/before.png`);
    expect(screen.getByLabelText("Project 1, after")).toHaveValue("https://evil.example/after.png");
    expect(document.querySelector("input[type=file]")).toBeNull();
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    vi.unstubAllGlobals();
  });

  it("is read-only in View as client", () => {
    page(VALUES, { readOnly: true });
    expect(screen.getByLabelText("Project 1, before")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Residential service 1")).toHaveAttribute("readonly");
  });
});
