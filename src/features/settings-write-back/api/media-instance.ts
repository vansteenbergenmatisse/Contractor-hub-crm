import { allowedLogoHosts, getBrandService } from "@/features/brand";
import { createTenantCustomValueAdapter, createTenantMediaAdapter, createTenantMediaLibraryAdapter, fetchMediaBytes } from "@/features/highlevel";
import { mediaFolderOf } from "@/features/settings";
import { claimSaveLock, releaseSaveLock } from "../db/save-lock";
import { beginValueChange, finishValueChange } from "../db/value-changes";
import { lockedKeysOf } from "../db/value-locks";
import { replaceImage, type CheckedImage } from "./media-replace";

// The real Change image. The adapters are built per call, so `next build` needs no environment.
// The library adapter (read and create folder, no trash) is used only to add an image to a value that
// holds no library file (empty, or a link from elsewhere). A folder create is audited (media-replace).
export function replaceTenantImage(input: { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage; unlocked?: string }) {
  const values = createTenantCustomValueAdapter();
  const media = createTenantMediaAdapter();
  // Built on first use: most calls replace a library file and never need it.
  let lib: ReturnType<typeof createTenantMediaLibraryAdapter> | undefined;
  const library = () => (lib ??= createTenantMediaLibraryAdapter());
  const hosts = allowedLogoHosts();
  return replaceImage(input, {
    // Read again under the save lease: a key locked during the upload is still refused.
    locks: lockedKeysOf,
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
    library: (...args: Parameters<ReturnType<typeof createTenantMediaLibraryAdapter>["library"]>) => library().library(...args),
    createFolder: (...args: Parameters<ReturnType<typeof createTenantMediaLibraryAdapter>["createFolder"]>) => library().createFolder(...args),
    folderOf: mediaFolderOf,
  });
}
