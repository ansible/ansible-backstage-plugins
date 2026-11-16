/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable('artifacts', table => {
    table.text('signing');
    table.text('tag_timestamps');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable('artifacts', table => {
    table.dropColumns('signing', 'tag_timestamps');
  });
};
