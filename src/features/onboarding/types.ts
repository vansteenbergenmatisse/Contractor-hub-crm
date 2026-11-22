// Types shared inside the onboarding feature.
export type UserCounts = {
  created: number;
  linked: number;
  existing: number;
  restored: number;
  // Accounts moved here from another client (optional so older count literals stay valid).
  moved?: number;
  deactivated: number;
  skippedAgency: number;
  skippedConflict: number;
  skippedInvalid: number;
  capped: number;
  suspicious: number;
  failed: number;
};

export const emptyUserCounts = (): Required<UserCounts> => ({
  created: 0, linked: 0, existing: 0, restored: 0, moved: 0, deactivated: 0, skippedAgency: 0, skippedConflict: 0, skippedInvalid: 0, capped: 0, suspicious: 0, failed: 0,
});

export type SyncSummary = {
  companies: number;
  installedLocations: number;
  onboarded: number;
  usersCreated: number;
  missingApp: number;
  alertsSent: number;
  failures: number;
};
