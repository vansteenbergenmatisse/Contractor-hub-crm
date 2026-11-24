import { clientViewCookieName, currentUserFromHeaders, getGuards, hitRateLimit } from "@/features/auth";
import { allowedLogoHosts, getBrandService, getTenantCustomValuesReadOnly } from "@/features/brand";
import { createTenantCustomValueAdapter, createTenantMediaAdapter, createTenantMediaLibraryAdapter, fetchMediaBytes } from "@/features/highlevel";
import { ESSENTIAL_KEYS, isSettingsKeyAllowed, labelOfKey } from "@/features/settings";
import { beginValueChange, checkSvg, claimSaveLock, finishValueChange, releaseSaveLock } from "@/features/settings-write-back";
import { parseEnv } from "@/shared/config";
import type { TemplateCopyView } from "../types";
import { applyTemplateCopy, previewTemplateCopy, type CopyDeps } from "./apply";
import { compressToWebp } from "./compress";
import { createImageCopier } from "./image-copy";
import { createPacer } from "./pace";
import { isAllowedMediaUrl, isImageLink, templateCopyConfig, templateDigest, valueToken } from "./plan";
import { handleTemplateCopy } from "./route";
import { identityKeys, templateWarnings } from "./warning";

// Per admin: one preview plus a handful of batches per client, with room for several clients an hour.
const COPY_LIMIT = 300;
const COPY_WINDOW_MS = 3_600_000;
// fetchMediaBytes cap for a template file before compression. HighLevel's upload limit is 25 MB.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Values of a key that is not on the Settings allowlist count as secret-looking: copied, but never
// shown to the browser and never kept in the audit table.
const isSecret = (key: string) => !isSettingsKeyAllowed(key);

// One pacer per location for the life of this server instance, so a 429 backoff and a halved pace
// carry over to the page's next batch and are shared by two copies reading the same template. Other
// instances keep their own (HighLevel's limit is per location; this narrows, not closes, that gap).
const pacers = new Map<string, ReturnType<typeof createPacer>>();
const MAX_PACERS = 500;
function pacerOf(tenantId: string) {
  let pacer = pacers.get(tenantId);
  if (!pacer) {
    if (pacers.size >= MAX_PACERS) pacers.clear();
    pacer = createPacer({ now: Date.now, wait });
    pacers.set(tenantId, pacer);
  }
  return pacer;
}

// Any View as client cookie, valid or not, counts as viewing: a broken cookie must not let an admin
// action through (currentUserFromHeaders treats an unreadable one as "not viewing").
function hasViewCookie(request: Request, appOrigin: string): boolean {
  const name = clientViewCookieName(appOrigin);
  return (request.headers.get("cookie") ?? "").split(";").some((part) => part.trim().startsWith(`${name}=`));
}

// The real reads and writes, built per call so `next build` needs no environment. The template is
// read with its own location token, the target written with its own. One pacer per location.
function copyDeps(targetTenantId: string, templateTenantId: string, secret: string): CopyDeps {
  const templatePace = pacerOf(templateTenantId);
  const targetPace = pacerOf(targetTenantId);
  const templateValues = createTenantCustomValueAdapter(templatePace);
  const targetValues = createTenantCustomValueAdapter(targetPace);
  const templateMedia = createTenantMediaLibraryAdapter(templatePace);
  const targetLibrary = createTenantMediaLibraryAdapter(targetPace);
  const targetMedia = createTenantMediaAdapter(targetPace);
  const hosts = allowedLogoHosts();
  let limitedSeen = targetPace.limitedCount();
  return {
    readTemplate: () => templateValues.read(templateTenantId),
    readTarget: () => targetValues.read(targetTenantId),
    update: (row, value) => targetValues.update(targetTenantId, row, value),
    begin: beginValueChange,
    finish: finishValueChange,
    claim: () => claimSaveLock(targetTenantId),
    release: (holder) => releaseSaveLock(targetTenantId, holder),
    invalidate: () => getBrandService().expire(targetTenantId),
    copyImage: createImageCopier({
      templateLibrary: () => templateMedia.library(templateTenantId),
      targetLibrary: () => targetLibrary.library(targetTenantId),
      createFolder: (name, parentId) => targetLibrary.createFolder(targetTenantId, name, parentId),
      upload: (file) => targetMedia.upload(targetTenantId, file),
      fetchBytes: (url) => fetchMediaBytes(url, hosts, { maxBytes: MAX_SOURCE_BYTES }),
      compress: compressToWebp,
      checkSvg,
      isAllowedHost: (url) => isAllowedMediaUrl(url, hosts),
    }),
    tokenOf: (key, value) => valueToken(secret, targetTenantId, key, value),
    digestOf: (rows) => templateDigest(secret, rows),
    isImage: (value) => isImageLink(value, hosts),
    isSecret,
    wasLimited: () => {
      const now = targetPace.limitedCount();
      const fresh = now > limitedSeen;
      limitedSeen = now;
      return fresh;
    },
    now: Date.now,
  };
}

// The route file's whole body.
export async function templateCopyRoute(request: Request, tenantId: string): Promise<Response> {
  const env = parseEnv("auth");
  const secret = env.BETTER_AUTH_SECRET;
  const appOrigin = new URL(env.APP_URL).origin;
  return handleTemplateCopy(request, tenantId, {
    adminId: (req) => getGuards().adminId(req),
    isViewing: async (req) => hasViewCookie(req, appOrigin) || (await currentUserFromHeaders(req.headers))?.viewing === true,
    limiter: (key) => hitRateLimit(key, COPY_LIMIT, COPY_WINDOW_MS, new Date()),
    appOrigin,
    config: templateCopyConfig(),
    preview: ({ targetTenantId, templateTenantId }) => previewTemplateCopy(copyDeps(targetTenantId, templateTenantId, secret)),
    apply: ({ targetTenantId, templateTenantId, actorId, overwrite, skip, templateDigest: digest }) =>
      applyTemplateCopy({ targetTenantId, actorId, overwrite, skip, templateDigest: digest }, copyDeps(targetTenantId, templateTenantId, secret)),
  });
}

// For /admin/clients. Undefined while the copy is off. Never throws and never waits past the warning
// budget: an unknown client shows no warning.
export async function loadTemplateCopyView(tenantIds: readonly string[]): Promise<TemplateCopyView | undefined> {
  const config = templateCopyConfig();
  if (!config.enabled || !config.templateTenantId) return undefined;
  try {
    const warnings = await templateWarnings({
      templateTenantId: config.templateTenantId,
      tenantIds,
      keys: identityKeys(ESSENTIAL_KEYS),
      read: getTenantCustomValuesReadOnly,
      labelOf: labelOfKey,
    });
    return { templateTenantId: config.templateTenantId, warnings };
  } catch {
    console.error("Template copy failed: step=warnings");
    return { templateTenantId: config.templateTenantId, warnings: {} };
  }
}
