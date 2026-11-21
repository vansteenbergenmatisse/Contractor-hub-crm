import { getPrisma } from "@/shared/lib/prisma";
import { aadFor, encrypt } from "@/shared/lib/encryption";
import type { SaveAgencyConnectionInput, SaveLocationConnectionInput } from "../types";

// The only place the highlevel feature writes tokens. Every token is encrypted with an aad that
// binds it to its table, owner and column (see src/shared/lib/encryption.ts).

export async function saveAgencyConnection(
  input: SaveAgencyConnectionInput,
  encryptionKey: string,
): Promise<void> {
  const aad = (column: string) => aadFor("HlAgencyConnection", input.companyId, column);
  const data = {
    accessTokenEnc: encrypt(input.accessToken, encryptionKey, aad("accessTokenEnc")),
    refreshTokenEnc: encrypt(input.refreshToken, encryptionKey, aad("refreshTokenEnc")),
    expiresAt: input.expiresAt,
  };
  await getPrisma().hlAgencyConnection.upsert({
    where: { companyId: input.companyId },
    create: { companyId: input.companyId, ...data },
    update: data,
  });
}

// One tenant per location. Safe to repeat: a re-install reconnects the same tenant.
export async function saveLocationConnection(
  input: SaveLocationConnectionInput,
  encryptionKey: string,
): Promise<{ tenantId: string }> {
  return getPrisma().$transaction(async (tx) => {
    // A location must not silently move to another agency (a transfer or an upstream mistake).
    const existing = await tx.tenant.findUnique({
      where: { locationId: input.locationId },
      select: { companyId: true },
    });
    if (existing?.companyId && existing.companyId !== input.companyId) {
      throw new Error("Location already belongs to a different agency.");
    }
    const tenant = await tx.tenant.upsert({
      where: { locationId: input.locationId },
      create: {
        locationId: input.locationId,
        companyId: input.companyId,
        name: input.name,
        status: "connected",
      },
      update: {
        companyId: input.companyId,
        // Keep a known name if HighLevel sent none this time.
        ...(input.name === null ? {} : { name: input.name }),
        status: "connected",
        uninstalledAt: null,
      },
      select: { id: true },
    });
    const aad = (column: string) => aadFor("HlLocationConnection", tenant.id, column);
    const data = {
      accessTokenEnc: encrypt(input.accessToken, encryptionKey, aad("accessTokenEnc")),
      refreshTokenEnc:
        input.refreshToken === null
          ? null
          : encrypt(input.refreshToken, encryptionKey, aad("refreshTokenEnc")),
      expiresAt: input.expiresAt,
    };
    await tx.hlLocationConnection.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, locationId: input.locationId, ...data },
      update: data,
    });
    return { tenantId: tenant.id };
  });
}
