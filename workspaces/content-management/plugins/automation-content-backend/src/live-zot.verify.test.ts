/**
 * @jest-environment node
 *
 * TEMPORARY live-fire verification for the AAP-94357 artifact-intake lane.
 * Runs against the real local Zot registry (https://localhost:8445) instead of
 * a mock. Skips unless LIVE_ZOT=1. Delete after verification or keep env-gated.
 */
import knexFactory from 'knex';
import { defaultContentTypes } from '@ansible/plugin-catalog-backend-module-automation-content';
import type { RegistryConnection } from '@ansible/automation-content-common';
import { ContentStore } from './ContentStore';

const live = process.env.LIVE_ZOT === '1';
const describeLive = live ? describe : describe.skip;

const silent = { info: () => {}, warn: () => {}, debug: () => {} };

async function liveStore(): Promise<ContentStore> {
  const db = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  await db.schema.createTable('artifacts', table => {
    table.string('ref').primary();
    table.string('type').notNullable();
    table.string('registry').notNullable().index();
    table.string('repository').notNullable();
    table.string('digest').notNullable();
    table.text('tags').notNullable().defaultTo('[]');
    table.string('pull_reference').notNullable();
    table.boolean('contents_known').notNullable().defaultTo(false);
    table.text('classification').notNullable().defaultTo('{}');
    table.text('manifest');
    table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
  });
  await db.schema.createTable('items', table => {
    table.string('key').primary();
    table.string('fqcn').notNullable().index();
    table.string('name').notNullable();
    table.string('type').notNullable();
    table.string('collection').notNullable();
    table.string('collection_version').notNullable();
    table.string('short_description');
    table.string('version_added');
    table.boolean('deprecated').notNullable().defaultTo(false);
    table
      .string('artifact_ref')
      .notNullable()
      .references('ref')
      .inTable('artifacts')
      .onDelete('CASCADE');
    table.text('detail');
    table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
  });
  const connection: RegistryConnection = {
    name: 'local-zot',
    url: 'https://localhost:8445',
    auth: { type: 'anonymous' },
    insecure: true,
    repositories: [
      'demo/utopia-ee',
      'demo/utopia-bootstrap-ee',
      'demo/basic-ee',
      'demo/skills/utopia-backup-validation',
      'demo/skills/utopia-cluster-triage',
      'demo/collections/utopia-accounts',
      'demo/collections/utopia-network',
      'demo/skills/cluster-triage',
      'demo/collections/ansible-utils',
    ],
  };
  return new ContentStore(
    [connection],
    db as never,
    silent,
    defaultContentTypes(),
  );
}

describeLive('live Zot registry intake', () => {
  it('classifies, enumerates and persists mixed content types', async () => {
    const store = await liveStore();
    expect((await store.refreshRegistry('local-zot')).ok).toBe(true);

    const all = await store.listArtifacts();
    const byType = (t: string) => all.filter(a => a.type === t);

    // Report what actually happened, for the verification record.
    const summary = all.map(a => ({
      repo: a.repository,
      type: a.type,
      tags: a.tags,
      contentsKnown: a.contentsKnown,
    }));
    console.log(JSON.stringify(summary, null, 2));

    // EEs still classify as execution-environments.
    const ees = byType('execution-environment');
    expect(ees.length).toBeGreaterThan(0);
    expect(ees.every(a => a.repository.endsWith('-ee'))).toBe(true);

    // Skills classify and enumerate from SKILL.md frontmatter.
    const skills = byType('skill');
    expect(skills.length).toBe(2);
    for (const skill of skills) {
      expect(skill.contentsKnown).toBe(true);
      const items = await store.itemsIn(skill.ref);
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('skill');
      expect(items[0].name).toBe(skill.repository.split('/').pop());
      expect(items[0].shortDescription).toBeTruthy();
      console.log(
        `skill ${skill.repository}: ${items[0].name} — ${items[0].shortDescription}`,
      );
    }

    // Collections classify and enumerate FQCN + version from MANIFEST.json.
    // 3 artifacts: utopia-accounts 1.0.0, utopia-network 1.0.0 and 1.1.0
    // (each release tag is a distinct digest, hence a distinct artifact).
    const collections = byType('collection');
    expect(collections.length).toBe(3);
    for (const collection of collections) {
      expect(collection.contentsKnown).toBe(true);
      const items = await store.itemsIn(collection.ref);
      expect(items.length).toBe(1);
      expect(items[0].fqcn).toMatch(/^utopia\./);
      expect(items[0].collectionVersion).toMatch(/^\d+\.\d+\.\d+$/);
      const detail = ((items[0] as unknown as { detail?: unknown }).detail ??
        {}) as Record<string, unknown>;
      expect(Array.isArray(detail.authors)).toBe(true);
      expect(Array.isArray(detail.tags)).toBe(true);
      console.log(
        `collection ${collection.repository}: ${items[0].fqcn} ${items[0].collectionVersion}`,
      );
    }

    // Old generic image manifests stay honestly unclassified.
    const unclaimed = byType('oci-image');
    expect(unclaimed.length).toBe(2);
    expect(unclaimed.every(a => a.contentsKnown === false)).toBe(true);

    // No artifact silently misfiled.
    expect(
      all.every(a =>
        ['execution-environment', 'skill', 'collection', 'oci-image'].includes(
          a.type,
        ),
      ),
    ).toBe(true);
  }, 120_000);
});
