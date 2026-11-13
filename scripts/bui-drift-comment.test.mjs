import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const upsert = require('../.github/scripts/bui-drift-comment.cjs');

const report = over => ({ unlisted: [], growth: [], shrunk: [], ...over });

function harness({ comments = [], pulls = [], run = {} } = {}) {
  const calls = [];
  const github = {
    paginate: async () => comments,
    rest: {
      pulls: { list: async () => ({ data: pulls }) },
      issues: {
        listComments: async () => ({ data: [] }),
        createComment: async a =>
          calls.push(['create', a.issue_number, a.body]),
        updateComment: async a => calls.push(['update', a.comment_id, a.body]),
        deleteComment: async a => calls.push(['delete', a.comment_id]),
      },
    },
  };
  const context = {
    repo: { owner: 'ansible', repo: 'ansible-backstage-plugins' },
    payload: { workflow_run: run },
  };
  return { calls, github, context };
}

const finding = {
  unlisted: [{ path: 'a/b.tsx', detail: 'imports @mui/material' }],
};

test('comments on the pull request named by workflow_run', async () => {
  const h = harness({ run: { pull_requests: [{ number: 42 }] } });
  await upsert({
    github: h.github,
    context: h.context,
    report: report(finding),
  });
  assert.equal(h.calls[0][0], 'create');
  assert.equal(h.calls[0][1], 42);
});

test('falls back to a unique API match when pull_requests is empty', async () => {
  const run = {
    pull_requests: [],
    head_branch: 'feature',
    head_repository: { owner: { login: 'someone' }, full_name: 'someone/fork' },
  };
  const pulls = [{ number: 77, head: { repo: { full_name: 'someone/fork' } } }];
  const h = harness({ run, pulls });
  await upsert({
    github: h.github,
    context: h.context,
    report: report(finding),
  });
  assert.equal(h.calls[0][0], 'create');
  assert.equal(h.calls[0][1], 77);
});

test('skips when the API match is ambiguous', async () => {
  const run = {
    pull_requests: [],
    head_branch: 'feature',
    head_repository: { owner: { login: 'someone' }, full_name: 'someone/fork' },
  };
  const pulls = [77, 78].map(number => ({
    number,
    head: { repo: { full_name: 'someone/fork' } },
  }));
  const h = harness({ run, pulls });
  await upsert({
    github: h.github,
    context: h.context,
    report: report(finding),
  });
  assert.deepEqual(h.calls, []);
});

test('ignores a malformed report', async () => {
  const h = harness({ run: { pull_requests: [{ number: 42 }] } });
  await upsert({
    github: h.github,
    context: h.context,
    report: { unlisted: {}, growth: [] },
  });
  assert.deepEqual(h.calls, []);
});

test('neutralises backticks and mentions from the report', async () => {
  const h = harness({ run: { pull_requests: [{ number: 42 }] } });
  const item = { path: 'a`b.tsx', detail: 'ping @team from `x`' };
  await upsert({
    github: h.github,
    context: h.context,
    report: report({ unlisted: [item] }),
  });
  const body = h.calls[0][2];
  assert.ok(!body.includes('a`b.tsx'));
  assert.ok(!body.includes('@team'));
  assert.ok(body.includes('a\u200Bb.tsx') === false); // path had no @
  assert.ok(body.includes('ping @\u200Bteam'));
});

test('deletes the comment when the report is clean', async () => {
  const h = harness({
    run: { pull_requests: [{ number: 42 }] },
    comments: [
      { id: 9, user: { type: 'Bot' }, body: '<!-- bui-drift --> old' },
    ],
  });
  await upsert({ github: h.github, context: h.context, report: report({}) });
  assert.deepEqual(h.calls[0], ['delete', 9]);
});
