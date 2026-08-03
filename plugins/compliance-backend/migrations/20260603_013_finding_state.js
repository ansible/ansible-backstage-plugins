"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable("compliance_findings", (table) => {
    table.string("finding_state").nullable();
    table.index(["finding_state"]);
  });
}

async function down(knex) {
  await knex.schema.alterTable("compliance_findings", (table) => {
    table.dropIndex(["finding_state"]);
    table.dropColumn("finding_state");
  });
}
