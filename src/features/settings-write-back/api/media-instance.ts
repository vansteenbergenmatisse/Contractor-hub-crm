import { allowedLogoHosts, getBrandService } from "@/features/brand";
import { createTenantCustomValueAdapter, createTenantMediaAdapter, createTenantMediaLibraryAdapter, fetchMediaBytes } from "@/features/highlevel";
import { mediaFolderOf } from "@/features/settings";
import { claimSaveLock, releaseSaveLock } from "../db/save-lock";
import { beginValueChange, finishValueChange } from "../db/value-changes";
import { replaceImage, type CheckedImage } from "./media-replace";

// The real Change image. The adapters are built per call, so `next build` needs no environment.
// The library adapter (read and create folder, no trash) is used only to add an image to a value that
// holds no library file (empty, or a link from elsewhere). A folder create is audited (media-replace).
export function replaceTenantImage(input: { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage; unlocked?: string }) {
  const values = createTenantCustomValueAdapter();
  const media = createTenantMediaAdapter();
  const library = createTenantMediaLibraryAdapter();
  const hosts = allowedLogoHosts();
  return replaceImage(input, {
    read: values.read,
    readAll: values.readAll,
    update: values.update,
    begin: beginValueChange,
    finish: finishValueChange,
    invalidate: (tenantId) => getBrandService().expire(tenantId),
    claim: claimSaveLock,
    release: releaseSaveLock,
    now: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    find: media.find,
    verify: media.verify,
    trash: media.trash,
    upload: media.upload,
    fetchBytes: (url, maxBytes) => fetchMediaBytes(url, hosts, { maxBytes }),
    hosts,
    library: library.library,
    createFolder: library.createFolder,
    folderOf: mediaFolderOf,
  });
}
