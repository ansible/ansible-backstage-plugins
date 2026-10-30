/**
 * Add error_details column to compliance_scans table.
 *
 * When a scan fails, the plugin now fetches the real error from the
 * Controller (e.g., result_traceback from the failed child job) and
 * caches it in this column. This allows the frontend to show
 * actionable error details instead of a generic "scan failed" message.
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260527_005_scan_error_details.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.text('error_details').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('error_details');
  });
}
