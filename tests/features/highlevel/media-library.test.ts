import { describe, expect, it, vi } from "vitest";
import { createMediaAdapter, createMediaLibraryAdapter, type MediaAdapterDeps } from "@/features/highlevel";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const own = (over: Record<string, unknown>) => ({ altId: "loc-1", altType: "location", ...over });
const library = (tree: Record<string, { file?: unknown[]; folder?: unknown[] }>) =>
  vi.fn<MediaAdapterDeps["requestFiles"]>(async (_token, _location, page) => {
    const rows = tree[page.parentId ?? "root"]?.[page.type] ?? [];
    return json({ files: rows.slice(page.offset, page.offset + page.limit) });
  });

function deps(over: Partial<MediaAdapterDeps> = {}): MediaAdapterDeps {
  return {
    readLocationId: vi.fn(async () => "loc-1"),
    getLocationToken: vi.fn(async () => "token-1"),
    requestFiles: vi.fn(async () => json({ files: [] })),
    requestUpload: vi.fn(async () => json({ fileId: "f1", url: "https://x.test/a" })),
    requestTrash: vi.fn(async () => json([])),
    ...over,
  };
}

describe("media library adapter (template copy)", () => {
  it("is kept apart from Change image: the settings adapter has no folder write", () => {
    expect(Object.keys(createMediaAdapter(deps())).sort()).toEqual(["find", "trash", "upload", "verify"]);
    expect(Object.keys(createMediaLibraryAdapter(deps())).sort()).toEqual(["createFolder", "library"]);
  });

  it("lists every file and folder with names and parents", async () => {
    const requestFiles = library({
      root: { folder: [own({ _id: "d1", type: "folder", name: "Logos" })], file: [own({ _id: "f0", name: "top.png", url: "https://h/top" })] },
      d1: { folder: [own({ _id: "d2", type: "folder", name: "Dark", parentId: "d1" })] },
      d2: { file: [own({ _id: "f1", name: "logo.svg", url: "https://h/logo", parentId: "d2" })] },
    });
    const result = await createMediaLibraryAdapter(deps({ requestFiles })).library("t1");
    expect(result).toEqual({
      ok: true,
      files: [
        { id: "f0", name: "top.png", url: "https://h/top", parentId: null },
        { id: "f1", name: "logo.svg", url: "https://h/logo", parentId: "d2" },
      ],
      folders: [
        { id: "d1", name: "Logos", parentId: null },
        { id: "d2", name: "Dark", parentId: "d1" },
      ],
    });
  });

  it("answers permission on a 403", async () => {
    const requestFiles = vi.fn(async () => new Response("no", { status: 403 }));
    expect(await createMediaLibraryAdapter(deps({ requestFiles })).library("t1")).toEqual({ ok: false, reason: "permission" });
  });

  it("creates a folder and takes the id from the answer", async () => {
    const requestCreateFolder = vi.fn(async () => json({ _id: "new1", name: "Logos" }));
    const media = createMediaLibraryAdapter(deps({ requestCreateFolder }));
    expect(await media.createFolder("t1", "Logos", "p1")).toEqual({ kind: "created", id: "new1" });
    expect(requestCreateFolder).toHaveBeenCalledWith("token-1", "loc-1", { name: "Logos", parentId: "p1" });
  });

  it("finds the new folder by exact name when the answer has no id (undocumented)", async () => {
    const requestCreateFolder = vi.fn(async () => json({ name: "Logos" }));
    const requestFiles = library({ root: { folder: [own({ _id: "d9", type: "folder", name: "Logos" }), own({ _id: "d8", type: "folder", name: "logos" })] } });
    const media = createMediaLibraryAdapter(deps({ requestCreateFolder, requestFiles }));
    expect(await media.createFolder("t1", "Logos", null)).toEqual({ kind: "created", id: "d9" });
  });

  it("answers unconfirmed when the folder cannot be found afterwards, and permission on 403", async () => {
    const lost = createMediaLibraryAdapter(deps({ requestCreateFolder: vi.fn(async () => json({})) }));
    expect(await lost.createFolder("t1", "Logos", null)).toEqual({ kind: "unconfirmed" });
    const denied = createMediaLibraryAdapter(deps({ requestCreateFolder: vi.fn(async () => new Response("", { status: 403 })) }));
    expect(await denied.createFolder("t1", "Logos", null)).toEqual({ kind: "permission" });
    const timeout = createMediaLibraryAdapter(deps({ requestCreateFolder: vi.fn(async () => new Response("", { status: 504 })) }));
    expect(await timeout.createFolder("t1", "Logos", null)).toEqual({ kind: "unconfirmed" });
  });

  it("refuses to create a folder without the request wired", async () => {
    expect(await createMediaLibraryAdapter(deps()).createFolder("t1", "x", null)).toEqual({ kind: "rejected" });
  });
});
