# Verifying the migrated CI workflows

Use a temporary pull request to verify the ACK labeler and SonarCloud follow-up
workflows after their definitions are merged into the default branch. This
checklist changes no application behavior or workflow configuration.

## Prerequisites

- The migrated workflows are available on `main`.
- An authorized reviewer is available to approve the `sonarcloud-analysis`
  environment when requested.
- The temporary pull request is non-draft, targets `main`, and has a conventional
  title such as `chore: smoke-test migrated CI workflows`.

## Procedure

1. Open the temporary pull request without adding classification labels manually.
2. Verify that the read-only `ack` check passes and the separate `ack labeler`
   workflow adds the expected `chore` label.
3. Wait for the `PR` workflow to succeed. Review the triggering revision before
   approving the protected SonarCloud job.
4. Verify that the follow-up `Code Quality` run uses the `workflow_run` event,
   resolves the intended pull request and head commit, and downloads coverage
   from the triggering `PR` run.
5. Verify that SonarCloud analysis and its quality-gate result appear on that
   same pull request.
6. Record the pull request URL, workflow run URLs, head commit and label outcome
   in the migration tracking issue. Close the temporary pull request without
   merging it after collecting the results.

## Verification scope

A same-repository smoke test does not establish fork support. Repeat the test
with an existing authorized fork before declaring fork handling validated.
Verify the push-to-`main` and manual SonarCloud paths separately. Passing local
tests or a run using the former `pull_request_target` event does not validate
the replacement event path.
