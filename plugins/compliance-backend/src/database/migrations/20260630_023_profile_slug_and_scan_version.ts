import type { Knex } from 'knex';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 128);
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF').catch(() => {});
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.string('profile_slug', 128).nullable();
  });

  const profiles = await knex('compliance_profile_registry').select(
    'id',
    'display_name',
  );
  const usedSlugs = new Set<string>();
  for (const p of profiles) {
    const slug = slugify(p.display_name as string);
    let candidate = slug;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${suffix}`;
      suffix++;
    }
    usedSlugs.add(candidate);
    await knex('compliance_profile_registry')
      .where('id', p.id)
      .update({ profile_slug: candidate });
  }

  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.string('profile_slug', 128).notNullable().alter();
    table.unique(['profile_slug']);
  });

  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework', 'display_name']);
  });

  await knex.schema.alterTable('compliance_scans', table => {
    table.string('profile_version', 64).nullable();
  });
  await knex.raw('PRAGMA foreign_keys = ON').catch(() => {});
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('profile_version');
  });

  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.unique(['framework', 'display_name']);
  });

  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['profile_slug']);
    table.dropColumn('profile_slug');
  });
}
