import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const dupes = await knex('compliance_profile_registry')
    .select('framework')
    .groupBy('framework')
    .havingRaw('COUNT(*) > 1');

  for (const { framework } of dupes) {
    const rows = await knex('compliance_profile_registry')
      .where('framework', framework)
      .orderByRaw("CASE WHEN connection_status = 'connected' THEN 0 ELSE 1 END")
      .orderBy('updated_at', 'desc');

    if (rows.length <= 1) continue;

    const keep = rows[0];
    const removeIds = rows.slice(1).map((r: { id: string }) => r.id);

    await knex('compliance_scans')
      .whereIn('profile_id', removeIds)
      .update({ profile_id: keep.id });

    const hasRemediationProfiles = await knex.schema.hasTable(
      'compliance_remediation_profiles',
    );
    if (hasRemediationProfiles) {
      await knex('compliance_remediation_profiles')
        .whereIn('profile_id', removeIds)
        .update({ profile_id: keep.id });
    }

    if (!keep.rule_count) {
      const donor = rows.find(
        (r: { rule_count: number | null }) => r.rule_count,
      );
      if (donor) {
        await knex('compliance_profile_registry')
          .where('id', keep.id)
          .update({ rule_count: donor.rule_count });
      }
    }

    await knex('compliance_profile_registry').whereIn('id', removeIds).delete();
  }

  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.unique(['framework']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework']);
  });
}
