// Every migration folder in prisma/migrations, oldest first. The deployed code expects all of them in
// its database. tests/features/admin/migrations.test.ts fails when this list and the folders differ,
// so add the folder name here in the same change that adds a migration.
export const MIGRATION_MANIFEST: readonly string[] = [
  "20261121000000_highlevel_install_tables",
  "20261121130000_auth_tables",
  "20261122000000_onboarding_tables",
  "20261122120000_tenant_sync_state",
  "20261122180000_unused_account_marker",
  "20261122190000_mailbox_prompt_dismissal",
  "20261122210000_tenant_sign_in_link",
  "20261123000000_custom_value_change",
  "20261123120000_tenant_login_lock",
  "20261123140000_route_start_notification",
  "20261124120000_custom_value_lock",
];
