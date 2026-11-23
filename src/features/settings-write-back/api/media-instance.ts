import { allowedLogoHosts, getBrandService } from "@/features/brand";
import { createTenantCustomValueAdapter, createTenantMediaAdapter, fetchMediaBytes } from "@/features/highlevel";
import { claimSaveLock, releaseSaveLock } from "../db/save-lock";
import { beginValueChange, finishValueChange } from "../db/value-changes";
import { replaceImage, type CheckedImage } from "./media-replace";

// The real Change image. The adapters are built per call, so `next build` needs no environment.
export function replaceTenantImage(input: { tenantId: string; actorId: string; key: string; expected: string; file: CheckedImage }) {
  const values = createTenantCustomValueAdapter();
  const media = createTenantMediaAdapter();
  const hosts = allowedLogoHosts();
  return replaceImage(input, {
    read: values.read,
    update: values.update,
    begin: beginValueChange,
    finish: finishValueChange,
    invalidate: (tenantId) => getBrandService().expire(tenantId),
    claim: claimSaveLock,
    release: releaseSaveLock,
    now: () => Date.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    find: media.find,
    upload: media.upload,
    fetchBytes: (url, maxBytes) => fetchMediaBytes(url, hosts, { maxBytes }),
    hosts,
  });
}
