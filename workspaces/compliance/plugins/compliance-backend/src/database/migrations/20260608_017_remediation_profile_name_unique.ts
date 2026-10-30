import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Application-layer uniqueness is enforced in saveRemediationProfile via
  // upsert logic. This index speeds up the lookup and catches edge cases.
  // SQLite doesn't support partial (WHERE) indexes via Knex, so we use a
  // non-partial unique index on (name, profile_id, status) — archived
  // profiles can share names since they include status in the key.
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.unique(['name', 'profile_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.dropUnique(['name', 'profile_id', 'status']);
  });
}
