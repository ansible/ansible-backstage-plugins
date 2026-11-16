/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('ee_metadata_overlays', table => {
    table.increments('id');
    // Refresh replaces artifact rows. Revisions have their own lifecycle.
    table.text('artifact_ref').notNullable();
    table.string('version', 64).notNullable();
    table.text('metadata').notNullable();
    table.unique(['artifact_ref', 'version']);
    table.index(['artifact_ref', 'id']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('ee_metadata_overlays');
};
