"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.createTable("compliance_cartridge_registry", (table) => {
    table.string("id").primary();
    table.string("display_name").notNullable();
    table.text("description").defaultTo("");
    table.string("framework").notNullable();
    table.string("version").defaultTo("");
    table.string("platform").defaultTo("");
    table.integer("workflow_template_id").nullable();
    table.integer("ee_id").nullable();
    table.text("remediation_playbook_path").defaultTo("");
    table.string("scan_tags").defaultTo("");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.index(["framework"]);
    table.index(["platform"]);
  });
}

async function down(knex) {
  await knex.schema.dropTableIfExists("compliance_cartridge_registry");
}
