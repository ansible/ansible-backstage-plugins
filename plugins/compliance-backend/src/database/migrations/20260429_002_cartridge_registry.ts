/**
 * Migration: Cartridge Registry
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260429_002_cartridge_registry.js (used by dist-dynamic packaging).
 *
 * Creates the compliance_cartridge_registry table to store mappings
 * between compliance frameworks and Controller resources (workflow
 * templates, execution environments, remediation playbook paths).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('compliance_cartridge_registry', table => {
    table.string('id').primary();
    table.string('display_name').notNullable();
    table.text('description').defaultTo('');
    table.string('framework').notNullable(); // e.g., 'DISA_STIG', 'CIS', 'PCI_DSS'
    table.string('version').defaultTo(''); // e.g., 'V2R8'
    table.string('platform').defaultTo(''); // e.g., 'RHEL 9'
    table.integer('workflow_template_id').nullable(); // Controller workflow JT ID
    table.integer('ee_id').nullable(); // Controller EE ID
    table.text('remediation_playbook_path').defaultTo(''); // path inside EE
    table.string('scan_tags').defaultTo(''); // comma-separated tags
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['framework']);
    table.index(['platform']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('compliance_cartridge_registry');
}
