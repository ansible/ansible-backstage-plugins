"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable("compliance_scans", (table) => {
    table.index(["inventory_id"]);
  });
}

async function down(knex) {
  await knex.schema.alterTable("compliance_scans", (table) => {
    table.dropIndex(["inventory_id"]);
  });
}
