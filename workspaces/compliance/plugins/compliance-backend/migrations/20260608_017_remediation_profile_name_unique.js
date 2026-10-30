/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.unique(['name', 'profile_id', 'status']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.dropUnique(['name', 'profile_id', 'status']);
  });
};
