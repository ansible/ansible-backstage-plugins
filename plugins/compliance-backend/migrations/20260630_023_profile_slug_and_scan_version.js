// Migration chain: 021 added UNIQUE(framework), 022 relaxed to UNIQUE(framework, display_name),
// this migration replaces both with UNIQUE(profile_slug). All three run in order for existing deployments.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

async function up(knex) {
  // 1. Add profile_slug column (nullable initially for backfill)
  await knex.schema.alterTable("compliance_profile_registry", (table) => {
    table.string("profile_slug", 128).nullable();
  });

  // 2. Backfill slugs from display_name with collision detection
  const profiles = await knex("compliance_profile_registry").select(
    "id",
    "display_name",
  );
  const usedSlugs = new Set();
  for (const p of profiles) {
    let slug = slugify(p.display_name);
    let candidate = slug;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${suffix}`;
      suffix++;
    }
    usedSlugs.add(candidate);
    await knex("compliance_profile_registry")
      .where("id", p.id)
      .update({ profile_slug: candidate });
  }

  // 3. Add new unique constraint BEFORE dropping old (architect recommendation)
  await knex.schema.alterTable("compliance_profile_registry", (table) => {
    table.string("profile_slug", 128).notNullable().alter();
    table.unique(["profile_slug"]);
  });

  // 4. Drop old compound unique
  await knex.schema.alterTable("compliance_profile_registry", (table) => {
    table.dropUnique(["framework", "display_name"]);
  });

  // 5. Add profile_version to scans (version-pinned at scan creation)
  await knex.schema.alterTable("compliance_scans", (table) => {
    table.string("profile_version", 64).nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable("compliance_scans", (table) => {
    table.dropColumn("profile_version");
  });

  await knex.schema.alterTable("compliance_profile_registry", (table) => {
    table.unique(["framework", "display_name"]);
  });

  await knex.schema.alterTable("compliance_profile_registry", (table) => {
    table.dropUnique(["profile_slug"]);
    table.dropColumn("profile_slug");
  });
}
