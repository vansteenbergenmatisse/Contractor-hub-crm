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
import { SettingsPage, type ImageUploader, type PrepareImage, type SaveValues } from "@/features/settings";
import { ImageChange } from "../../../src/features/settings/components/ImageChange";
import { ProtectedFolder } from "../../../src/features/settings/components/ProtectedFolder";

// Made-up values only.
const HOST = "assets.cdn.filesafe.space";
const OLD_WORK = `https://${HOST}/before.webp`;
const NEW_URL = "https://files.leadconnectorhq.com/x/new";
const VALUES = { business_name: "Test Co", "1_our_work_before": OLD_WORK, "1_our_work_after": "", partner1_logo: "", partner1_name: "Acme" };
const prepared = { blob: new Blob(["x"], { type: "image/webp" }), previewUrl: "blob:preview", summary: "WebP, 2400 by 1600, 300 KB (was 5.0 MB)" };
const photo = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });
const vector = () => new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
const prepareOk = () => vi.fn<PrepareImage>(async () => ({ ok: true, ...prepared }));
const saveAll: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });

type Shown = { uploadImage?: ImageUploader; prepareImage?: PrepareImage; readOnly?: boolean; saveValues?: SaveValues };
function show(props: Shown = {}) {
  return render(<PageStateProvider><SettingsPage initialValues={VALUES} initialSection="biz" account={{ imageHosts: [HOST] }} {...props} /></PageStateProvider>);
}
const group = (label: string) => screen.getByRole("group", { name: `Change ${label}` });
const pick = (file: File, box: HTMLElement) => fireEvent.change(within(box).getByLabelText(/choose/i, { selector: "input" }), { target: { files: [file] } });

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("Image picker: every image value, empty ones too", () => {
  it("shows the picker on an empty image value and uploads with an empty expected value", async () => {
    const uploadImage = vi.fn<ImageUploader>(async () => ({ status: "saved", url: NEW_URL, oldFile: "none" }));
    show({ uploadImage, prepareImage: prepareOk(), saveValues: saveAll });
    const after = group("Project 1, after");
    fireEvent.click(within(after).getByRole("button", { name: "Add image" }));
    pick(photo(), after);
    fireEvent.click(await within(after).findByRole("button", { name: "Save image" }));
    await within(after).findByText("Image added. It is in your media library.");
    expect(uploadImage).toHaveBeenCalledWith({ key: "1_our_work_after", expected: "", blob: prepared.blob });
  });

  it("gives image keys the picker that the old list did not know (a partner logo)", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk(), saveValues: saveAll });
    expect(within(group("Partner 1 logo")).getByRole("button", { name: "Add image" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Change Partner 1 name" })).toBeNull();
  });

  it("shows the size before and after compression", async () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk(), saveValues: saveAll });
    const after = group("Project 1, after");
    pick(photo(), after);
    expect(await within(after).findByText(/300 KB \(was 5\.0 MB\)/)).toBeTruthy();
  });
});

describe("Image picker: remove", () => {
  it("clears the value through the normal save, with the confirm-clear step, and never calls the uploader", async () => {
    const user = userEvent.setup();
    const uploadImage = vi.fn<ImageUploader>();
    const saveValues = vi.fn<SaveValues>(saveAll);
    show({ uploadImage, prepareImage: prepareOk(), saveValues });
    const before = group("Project 1, before");
    await user.click(within(before).getByRole("button", { name: "Remove image" }));
    expect((screen.getByLabelText(/^Project 1, before/) as HTMLInputElement).value).toBe("");
    expect(within(group("Project 1, before")).getByText(/Save this step to remove the image/)).toBeTruthy();
    expect(saveValues).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save Our work" }));
    await user.click(await screen.findByRole("button", { name: "Clear and save" }));
    await waitFor(() => expect(saveValues).toHaveBeenCalled());
    expect(saveValues.mock.calls[0][0]).toEqual([expect.objectContaining({ key: "1_our_work_before", value: "" })]);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("offers no remove on an empty value", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk(), saveValues: saveAll });
    expect(within(group("Project 1, after")).queryByRole("button", { name: "Remove image" })).toBeNull();
  });
});

describe("Image picker: says why it is not there", () => {
  it("names the upload switch when saving works but uploads are off", () => {
    show({ saveValues: saveAll });
    expect(screen.queryByRole("button", { name: /change image|add image/i })).toBeNull();
    expect(screen.getAllByText("Uploading images is not turned on for your account yet. You can paste an image link instead.").length).toBeGreaterThan(0);
  });

  it("names saving when saving does not reach the account", () => {
    show({ prepareImage: prepareOk() });
    expect(screen.queryByRole("button", { name: /change image|add image/i })).toBeNull();
    expect(screen.getAllByText("Uploading images needs saving to be on for your account.").length).toBeGreaterThan(0);
  });

  it("stays read-only in View as client, with no picker and no extra note", () => {
    show({ uploadImage: vi.fn(), prepareImage: prepareOk(), saveValues: saveAll, readOnly: true });
    expect(screen.queryByRole("button", { name: /change image|add image|remove image/i })).toBeNull();
    expect(screen.queryByText(/Uploading images/)).toBeNull();
  });
});

describe("Image picker: logo and favicon photo widening (switched off until the user approves the test change)", () => {
  const box = (allowPhoto: boolean, prepare: PrepareImage) =>
    render(<ImageChange fieldKey="business_logo" label="Logo" kind="svg" current="" dirty={false} upload={vi.fn()} prepare={prepare} onValue={vi.fn()} allowPhoto={allowPhoto} />);

  it("accepts an SVG or a photo, and compresses the photo", async () => {
    const prepare = prepareOk();
    box(true, prepare);
    const input = screen.getByLabelText(/choose/i, { selector: "input" }) as HTMLInputElement;
    expect(input.accept).toBe(".svg,image/svg+xml,image/*");
    pick(photo(), document.body);
    await waitFor(() => expect(prepare).toHaveBeenCalledWith(expect.any(File), "photo"));
    cleanup();
    const again = prepareOk();
    box(true, again);
    pick(vector(), document.body);
    await waitFor(() => expect(again).toHaveBeenCalledWith(expect.any(File), "svg"));
  });

  it("stays SVG only while switched off", () => {
    box(false, prepareOk());
    expect((screen.getByLabelText(/choose/i, { selector: "input" }) as HTMLInputElement).accept).toBe(".svg,image/svg+xml");
  });
});

describe("Image picker: inside a protected folder", () => {
  const step = { id: "res", title: "Residential services", line: "", keys: ["residentialservice1_image"], groups: [], protected: true };
  const control = (upload: ImageUploader) =>
    function renderPicker(field: { key: string; label: string }, saved: string, dirty: boolean, unlock?: string) {
      return <ImageChange fieldKey={field.key} label={field.label} kind="photo" current={saved} dirty={dirty} upload={upload} prepare={prepareOk()} onValue={vi.fn()} unlock={unlock} />;
    };
  const folder = (mode: "locked" | "edit", upload: ImageUploader) => render(
    <ProtectedFolder
      step={step} keys={step.keys} values={{ residentialservice1_image: "" }} draft={{ residentialservice1_image: "" }} longKeys={new Set()}
      mode={mode} error={null} problem={null} live saved={false} readOnly={false} blocked={false} saving={false} anySaving={false} otherOpen={false}
      onMode={vi.fn()} onEdit={vi.fn()} onLock={vi.fn()} onSave={vi.fn()} imageControl={control(upload)}
    />,
  );

  it("shows no picker while locked", () => {
    folder("locked", vi.fn());
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
  });

  it("shows the picker after the unlock and sends the folder's unlock with the upload", async () => {
    const upload = vi.fn<ImageUploader>(async () => ({ status: "saved", url: NEW_URL, oldFile: "none" }));
    folder("edit", upload);
    pick(photo(), document.body);
    fireEvent.click(await screen.findByRole("button", { name: "Save image" }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith({ key: "residentialservice1_image", expected: "", blob: prepared.blob, unlock: "res" }));
  });
});
