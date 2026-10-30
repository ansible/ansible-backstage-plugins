import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('compliance_scan_artifacts', table => {
    table.string('id').primary();
    table
      .string('scan_id')
      .notNullable()
      .references('id')
      .inTable('compliance_scans')
      .onDelete('CASCADE');
    table.string('artifact_key').notNullable();
    table.string('oci_reference').notNullable();
    table.string('artifact_name').notNullable();
    table.string('mime_type').notNullable().defaultTo('application/json');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['scan_id', 'artifact_key']);
    table.index(['scan_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('compliance_scan_artifacts');
}
