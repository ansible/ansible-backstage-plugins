/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('artifacts', table => {
    table.text('tag_timestamps').notNullable().defaultTo('{}');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('artifacts', table => {
    table.dropColumn('tag_timestamps');
  });
};
