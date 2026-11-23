// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { SettingsPage, type ImageUploader, type PrepareImage } from "@/features/settings";

const HOST = "assets.cdn.filesafe.space";
const OLD_LOGO = `https://${HOST}/old-logo.png`;
const OLD_WORK = `https://${HOST}/before.webp`;
const NEW_URL = "https://files.leadconnectorhq.com/x/new";
const VALUES = { business_name: "Test Co", business_logo: OLD_LOGO, "1_our_work_before": OLD_WORK };

const prepared = { blob: new Blob(["x"], { type: "image/webp" }), previewUrl: "blob:preview", summary: "WebP, 100 KB" };
const photo = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });
const vector = () => new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });

function show(props: { uploadImage?: ImageUploader; prepareImage?: PrepareImage; readOnly?: boolean } = {}) {
  return render(<PageStateProvider><SettingsPage initialValues={VALUES} initialSection="biz" account={{ imageHosts: [HOST] }} {...props} /></PageStateProvider>);
}
const prepareOk = () => vi.fn<PrepareImage>(async () => ({ ok: true, ...prepared }));
const logoGroup = () => screen.getByRole("group", { name: "Change Logo" });
const pick = (file: File, group = logoGroup()) => fireEvent.change(within(group).getByLabelText(/choose/i, { selector: "input" }), { target: { files: [file] } });

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("Change image: only when it can work", () => {
  it("shows no control without an uploader, and the URL field stays", () => {
    show();
    expect(screen.queryByRole("button", { name: /change image/i })).toBeNull();
    expect((screen.getByLabelText(/^Logo/) as HTMLInputElement).value).toBe(OLD_LOGO);
  });

  it("shows no control in View as client, even with an uploader", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk(), readOnly: true });
    expect(screen.queryByRole("button", { name: /change image/i })).toBeNull();
  });

  it("gives the image fields a control and leaves text fields alone", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk() });
    expect(within(logoGroup()).getByRole("button", { name: /change image/i })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Change Business name" })).toBeNull();
  });

  it("offers SVG only on the logo", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk() });
    const input = within(logoGroup()).getByLabelText(/choose/i, { selector: "input" }) as HTMLInputElement;
    expect(input.accept).toBe(".svg,image/svg+xml");
    expect(within(logoGroup()).getByText(/SVG file, up to 512 KB/)).toBeTruthy();
  });

  it("asks to finish a typed link first instead of showing a control that would clash", async () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk() });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Logo/), "x");
    expect(within(logoGroup()).queryByRole("button", { name: /change image/i })).toBeNull();
    expect(within(logoGroup()).getByText(/Save or undo your link change/)).toBeTruthy();
  });
});

describe("Change image: the flow", () => {
  it("previews first, saves only on confirm, then shows success and the new link", async () => {
    const uploadImage = vi.fn<ImageUploader>(async () => ({ status: "saved", url: NEW_URL }));
    const prepareImage = prepareOk();
    show({ uploadImage, prepareImage });
    pick(vector());
    await within(logoGroup()).findByRole("button", { name: "Save image" });
    expect(prepareImage).toHaveBeenCalledWith(expect.any(File), "svg");
    expect(uploadImage).not.toHaveBeenCalled();
    expect(within(logoGroup()).getByRole("img", { name: "New Logo preview" })).toBeTruthy();
    expect(within(logoGroup()).getByText("WebP, 100 KB")).toBeTruthy();

    fireEvent.click(within(logoGroup()).getByRole("button", { name: "Save image" }));
    await within(logoGroup()).findByText("Image changed. Your old file is still in your media library.");
    expect(uploadImage).toHaveBeenCalledWith({ key: "business_logo", expected: OLD_LOGO, blob: prepared.blob });
    await waitFor(() => expect((screen.getByLabelText(/^Logo/) as HTMLInputElement).value).toBe(NEW_URL));
  });

  it("uses the photo rules on an Our work field", async () => {
    const prepareImage = prepareOk();
    show({ uploadImage: vi.fn(), prepareImage });
    const group = screen.getByRole("button", { name: /Our work/i }) && null;
    expect(group).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Our work/i }));
    const work = screen.getByRole("group", { name: "Change Project 1, before" });
    pick(photo(), work);
    await waitFor(() => expect(prepareImage).toHaveBeenCalledWith(expect.any(File), "photo"));
  });

  it("accepts a dropped file", async () => {
    const prepareImage = prepareOk();
    show({ uploadImage: vi.fn(), prepareImage });
    fireEvent.drop(logoGroup(), { dataTransfer: { files: [vector()] } });
    await within(logoGroup()).findByRole("button", { name: "Save image" });
    expect(prepareImage).toHaveBeenCalledTimes(1);
  });

  it("shows progress while saving and blocks a second tap", async () => {
    let finish: (value: { status: "saved"; url: string }) => void = () => {};
    const uploadImage = vi.fn<ImageUploader>(() => new Promise((resolve) => { finish = resolve; }));
    show({ uploadImage, prepareImage: prepareOk() });
    pick(vector());
    const save = await within(logoGroup()).findByRole("button", { name: "Save image" });
    fireEvent.click(save);
    expect(await within(logoGroup()).findByText("Uploading and saving…")).toBeTruthy();
    expect(within(logoGroup()).queryByRole("button", { name: "Save image" })).toBeNull();
    finish({ status: "saved", url: NEW_URL });
    await within(logoGroup()).findByText(/Image changed/);
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });

  it("Cancel drops the preview and calls nothing", async () => {
    const uploadImage = vi.fn<ImageUploader>();
    show({ uploadImage, prepareImage: prepareOk() });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Cancel" }));
    expect(within(logoGroup()).getByRole("button", { name: /change image/i })).toBeTruthy();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("shows why a file cannot be used, next to the field", async () => {
    show({ uploadImage: vi.fn(), prepareImage: vi.fn<PrepareImage>(async () => ({ ok: false, message: "Choose an SVG file." })) });
    pick(photo());
    expect((await within(logoGroup()).findByRole("alert")).textContent).toContain("Choose an SVG file.");
  });
});

describe("Change image: says exactly what happened", () => {
  it.each([
    ["trashed", /moved to the trash/i],
    ["in_use", /another setting still uses it/i],
    ["kept", /could not be removed/i],
    ["unconfirmed", /could not confirm/i],
    ["unproven", /old file was kept/i],
    ["same", /already your current image/i],
  ] as const)("old file %s", async (oldFile, message) => {
    show({ uploadImage: vi.fn<ImageUploader>(async () => ({ status: "saved", url: NEW_URL, oldFile })), prepareImage: prepareOk() });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Save image" }));
    expect(await within(logoGroup()).findByText(message)).toBeTruthy();
  });

  it("names the specific SVG problem", async () => {
    show({ uploadImage: vi.fn<ImageUploader>(async () => ({ status: "invalid", svgProblem: "outside_link" })), prepareImage: prepareOk() });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Save image" }));
    expect((await within(logoGroup()).findByRole("alert")).textContent).toContain("This SVG links to an outside file.");
  });

  it("tells the owner when a failed change left its new file behind", async () => {
    show({ uploadImage: vi.fn<ImageUploader>(async () => ({ status: "rejected", leftover: true })), prepareImage: prepareOk() });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Save image" }));
    expect((await within(logoGroup()).findByRole("alert")).textContent).toMatch(/new file could not be removed/i);
  });

  it("encodes a photo again to the current file's format, once", async () => {
    const uploadImage = vi.fn<ImageUploader>()
      .mockResolvedValueOnce({ status: "format_mismatch", format: "png" })
      .mockResolvedValueOnce({ status: "saved", url: NEW_URL, oldFile: "trashed" });
    const prepareImage = prepareOk();
    show({ uploadImage, prepareImage });
    fireEvent.click(screen.getByRole("button", { name: /Our work/i }));
    const work = screen.getByRole("group", { name: "Change Project 1, before" });
    pick(photo(), work);
    fireEvent.click(await within(work).findByRole("button", { name: "Save image" }));
    await within(work).findByText(/moved to the trash/i);
    expect(prepareImage).toHaveBeenLastCalledWith(expect.any(File), "photo", "png");
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it("does not loop when the second format is refused too", async () => {
    const uploadImage = vi.fn<ImageUploader>(async () => ({ status: "format_mismatch", format: "png" }));
    show({ uploadImage, prepareImage: prepareOk() });
    fireEvent.click(screen.getByRole("button", { name: /Our work/i }));
    const work = screen.getByRole("group", { name: "Change Project 1, before" });
    pick(photo(), work);
    fireEvent.click(await within(work).findByRole("button", { name: "Save image" }));
    expect((await within(work).findByRole("alert")).textContent).toMatch(/PNG/);
    expect(uploadImage).toHaveBeenCalledTimes(2);
  });

  it("does not turn an SVG logo into another format", async () => {
    const uploadImage = vi.fn<ImageUploader>(async () => ({ status: "format_mismatch", format: "png" }));
    const prepareImage = prepareOk();
    show({ uploadImage, prepareImage });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Save image" }));
    expect((await within(logoGroup()).findByRole("alert")).textContent).toMatch(/PNG/);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(prepareImage).toHaveBeenCalledTimes(1);
  });
});

describe("Change image: failures are named", () => {
  it.each([
    ["needs_approval", /needs re-approval/i],
    ["connection", /connection needs attention/i],
    ["conflict", /changed in your account/i],
    ["busy", /another save is running/i],
    ["bad_host", /unexpected address/i],
    ["hash_mismatch", /did not match/i],
    ["rejected", /refused this image/i],
    ["unknown", /could not confirm/i],
    ["retry", /still live.*try again/i],
    ["limited", /too many/i],
    ["invalid", /cannot be used/i],
    ["failed", /still live|could not/i],
  ] as const)("%s", async (status, message) => {
    show({ uploadImage: vi.fn<ImageUploader>(async () => ({ status })), prepareImage: prepareOk() });
    pick(vector());
    fireEvent.click(await within(logoGroup()).findByRole("button", { name: "Save image" }));
    expect((await within(logoGroup()).findByRole("alert")).textContent).toMatch(message);
    expect((screen.getByLabelText(/^Logo/) as HTMLInputElement).value).toBe(OLD_LOGO);
  });
});
