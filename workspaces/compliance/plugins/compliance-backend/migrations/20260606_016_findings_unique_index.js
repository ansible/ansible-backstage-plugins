"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  // Remove duplicate rows before adding the constraint
  await knex.raw(`
    DELETE FROM compliance_findings WHERE id NOT IN (
      SELECT MIN(id) FROM compliance_findings GROUP BY scan_id, rule_id, host
    )
  `);

  await knex.schema.alterTable("compliance_findings", (table) => {
    table.unique(["scan_id", "rule_id", "host"]);
  });
}

async function down(knex) {
  await knex.schema.alterTable("compliance_findings", (table) => {
    table.dropUnique(["scan_id", "rule_id", "host"]);
  });
}
