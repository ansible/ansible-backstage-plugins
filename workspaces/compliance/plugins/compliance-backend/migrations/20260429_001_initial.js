"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.createTable("compliance_scans", (table) => {
    table.string("id").primary();
    table.string("profile_id").notNullable();
    table.integer("inventory_id").notNullable();
    table.string("scanner").notNullable().defaultTo("oscap");
    table.string("scan_type").notNullable().defaultTo("assessment");
    table.integer("workflow_job_id").nullable();
    table.string("status").notNullable().defaultTo("pending");
    table.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at").nullable();
    table.index(["profile_id"]);
    table.index(["status"]);
    table.index(["started_at"]);
  });

  await knex.schema.createTable("compliance_findings", (table) => {
    table.string("id").primary();
    table.string("scan_id").notNullable().references("id").inTable("compliance_scans").onDelete("CASCADE");
    table.string("rule_id").notNullable();
    table.string("stig_id").notNullable();
    table.string("host").notNullable();
    table.string("status").notNullable();
    table.string("severity").notNullable();
    table.text("actual_value").defaultTo("");
    table.text("expected_value").defaultTo("");
    table.text("evidence").nullable();
    table.index(["scan_id"]);
    table.index(["rule_id"]);
    table.index(["host"]);
    table.index(["severity"]);
    table.index(["status"]);
  });

  await knex.schema.createTable("compliance_remediation_profiles", (table) => {
    table.string("id").primary();
    table.string("name").notNullable();
    table.text("description").defaultTo("");
    table.string("profile_id").notNullable();
    table.string("scan_id").nullable();
    table.text("selections_json").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.index(["profile_id"]);
    table.index(["name"]);
  });

  await knex.schema.createTable("compliance_posture_snapshots", (table) => {
    table.string("id").primary();
    table.string("profile_id").notNullable();
    table.timestamp("timestamp").notNullable().defaultTo(knex.fn.now());
    table.integer("total_hosts").notNullable().defaultTo(0);
    table.integer("total_rules").notNullable().defaultTo(0);
    table.integer("pass_count").notNullable().defaultTo(0);
    table.integer("fail_count").notNullable().defaultTo(0);
    table.float("compliance_pct").notNullable().defaultTo(0);
    table.index(["profile_id"]);
    table.index(["timestamp"]);
  });
}

async function down(knex) {
  await knex.schema.dropTableIfExists("compliance_posture_snapshots");
  await knex.schema.dropTableIfExists("compliance_remediation_profiles");
  await knex.schema.dropTableIfExists("compliance_findings");
  await knex.schema.dropTableIfExists("compliance_scans");
}
