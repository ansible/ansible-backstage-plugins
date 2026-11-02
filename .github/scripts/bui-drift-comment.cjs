/*
 * Upserts the advisory BUI drift comment on a pull request.
 *
 * Runs from the privileged workflow_run consumer, never from the pull_request
 * run, so fork pull requests get the same comment without the pull_request
 * job holding a write token. `report` is untrusted data: it is parsed as JSON
 * and only ever interpolated into text.
 */
const MARKER = '<!-- bui-drift -->';
const LIMIT = 20;

module.exports = async function upsertBuiDriftComment({
  github,
  context,
  report,
}) {
  // The report comes from an unprivileged run, so treat it as untrusted data.
  const arrays = ['unlisted', 'growth', 'shrunk'];
  if (
    !report ||
    !Number.isInteger(report.pullNumber) ||
    arrays.some(key => !Array.isArray(report[key]))
  ) {
    console.log('Ignoring malformed drift report.');
    return;
  }

  const { owner, repo } = context.repo;
  const issue_number = report.pullNumber;
  const total = report.unlisted.length + report.growth.length;

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
      .map(i => `- \`${i.path ?? 'baseline'}\` - ${i.detail}`)
      .join('\n');

  const parts = [MARKER, '**BUI drift - advisory, not blocking**', ''];

  if (report.unlisted.length) {
    parts.push(
      `Non-BUI UI usage not covered by \`bui-baseline.yaml\` (${report.unlisted.length}):`,
      '',
      list(report.unlisted),
      '',
    );
  }
  if (report.growth.length) {
    parts.push(
      `\`bui-baseline.yaml\` grew (${report.growth.length}); that needs maintainer approval:`,
      '',
      list(report.growth),
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
    await github.rest.issues.createComment({ owner, repo, issue_number, body });
  }
};
