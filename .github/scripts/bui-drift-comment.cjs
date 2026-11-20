/*
 * Upserts the advisory BUI drift comment on a pull request.
 *
 * Runs from the privileged workflow_run consumer, never from the pull_request
 * run, so fork pull requests get the same comment without the pull_request
 * job holding a write token.
 *
 * The report is untrusted data. It is never used for routing: the pull
 * request comes from workflow_run metadata (or a unique API match), and its
 * text is sanitised before it reaches the comment.
 */
const MARKER = '<!-- bui-drift -->';
const LIMIT = 20;
const MAX_FIELD = 300;

// Strip backticks, which would close the code span, and defuse @mentions,
// which would otherwise ping whoever the artifact names.
const clean = value =>
  String(value ?? '')
    .replace(/`/g, "'")
    .replace(/@/g, '@\u200B')
    .slice(0, MAX_FIELD);

const asItems = items =>
  items.filter(i => i && typeof i === 'object' && typeof i.detail === 'string');

async function resolvePullNumber({ github, context }) {
  const run = context.payload.workflow_run;
  const direct = run?.pull_requests?.[0]?.number;
  if (Number.isInteger(direct)) return direct;

  // GitHub can report an empty pull_requests array for fork-originated runs.
  // Fall back to trusted run metadata and accept only an unambiguous match.
  const headRepository = run?.head_repository;
  const headOwner = headRepository?.owner?.login;
  const headBranch = run?.head_branch;
  if (!headOwner || !headBranch || !headRepository.full_name) return undefined;

  const { data } = await github.rest.pulls.list({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'all',
    head: `${headOwner}:${headBranch}`,
    per_page: 100,
  });
  const matches = data.filter(
    pr => pr.head?.repo?.full_name === headRepository.full_name,
  );
  return matches.length === 1 ? matches[0].number : undefined;
}

module.exports = async function upsertBuiDriftComment({
  github,
  context,
  report,
}) {
  const arrays = ['unlisted', 'growth', 'shrunk'];
  if (!report || arrays.some(key => !Array.isArray(report[key]))) {
    console.log('Ignoring malformed drift report.');
    return;
  }

  const issue_number = await resolvePullNumber({ github, context });
  if (!Number.isInteger(issue_number)) {
    console.log('Could not identify the triggering pull request; skipping.');
    return;
  }

  const { owner, repo } = context.repo;
  const unlisted = asItems(report.unlisted);
  const growth = asItems(report.growth);
  const total = unlisted.length + growth.length;

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existing = comments.find(
    c => c.user?.type === 'Bot' && c.body?.includes(MARKER),
  );

  if (total === 0) {
    if (existing) {
      await github.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existing.id,
      });
    }
    return;
  }

  const list = items =>
    items
      .slice(0, LIMIT)
      .map(i => `- \`${clean(i.path ?? 'baseline')}\` - ${clean(i.detail)}`)
      .join('\n');

  const parts = [MARKER, '**BUI drift - advisory, not blocking**', ''];

  if (unlisted.length) {
    parts.push(
      `Non-BUI UI usage not covered by \`bui-baseline.yaml\` (${unlisted.length}):`,
      '',
      list(unlisted),
      '',
    );
  }
  if (growth.length) {
    parts.push(
      `\`bui-baseline.yaml\` grew (${growth.length}); that needs maintainer approval:`,
      '',
      list(growth),
      '',
    );
  }
  parts.push(
    'New code should use `@backstage/ui`. To accept an exception, a maintainer runs `yarn bui:baseline` and explains why in the pull request.',
  );

  const body = parts.join('\n');
  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
  }
};
