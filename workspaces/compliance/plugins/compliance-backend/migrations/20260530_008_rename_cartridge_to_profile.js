/**
 * Rename compliance_cartridge_registry table to compliance_profile_registry.
 * Aligns internal naming with user-facing "compliance profile" terminology.
 */
exports.up = async function up(knex) {
  await knex.schema.renameTable(
    'compliance_cartridge_registry',
    'compliance_profile_registry',
  );
};

exports.down = async function down(knex) {
  await knex.schema.renameTable(
    'compliance_profile_registry',
    'compliance_cartridge_registry',
  );
};
