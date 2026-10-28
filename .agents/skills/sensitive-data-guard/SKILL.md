---
name: sensitive-data-guard
description: "Review a change for sensitive business information before it lands in a public repository. Classifies content into Tier 1 (credentials, customer/partner data, PII), Tier 2 (ticket provenance, internal meetings, unreleased plans, internal hostnames, internal process and artifacts), and Tier 3 (public), then produces findings and a verdict. Use before opening or updating any pull request; whenever adding or editing docs, ADRs, READMEs, changelogs, examples, test fixtures, scaffolder templates, or config defaults; whenever you accept agent-generated or AI-summarized text into the repo; and when reviewing someone else's PR."
---

# Sensitive data guard

Code in a public repository is usually fine to publish; *context* often is not.
AI-assisted work makes this worse: a summary drafted from meeting notes or an
internal ticket inherits customer names, unreleased plans, and internal
codenames with no signal that it does.

`gitleaks` and `detect-private-key` run in pre-commit and catch **credentials**.
They do not catch **data-classification** problems. That is this skill's job.

## Repo profile

Fill this in per repository before the first use; do not assume.

| Field | `ansible/ansible-backstage-plugins` |
|---|---|
| Visibility | public |
| Where docs land | `docs/adrs/{common,host,third-party}/`, `docs/next/`, `docs/3rd-party-plugins/` |
| Repo's own publishing rule | `docs/adrs/index.md`: ADRs are **public by default**; one stays unpublished if it still contains secrets, internal hostnames, or customer data |
| Credential scanning | pre-commit `gitleaks` + `detect-private-key`; CodeRabbit `no-hardcoded-secrets` |
| Prose review | CodeRabbit `path_instructions` + `custom_checks` (`.coderabbit.yaml`) |
| Private disclosure | `SECURITY.md` -> `security@ansible.com` |
| Skill placement | this repo's `.agents/skills/` for contributor-facing guards; team-internal skills stay in the private process repository — see *Placement caveat* |

**The repo's stated rule is a floor, not the bar.** If `docs/adrs/index.md`
says public-by-default, that is a statement of intent to publish; it is not
release approval. Where the organization's release policy is stricter, the
stricter reading wins — and that policy is never written down here. The mapping
between these abstract tiers and the organization's own scheme lives outside
every repository: in the reviewer's head and in non-public process material.
Never record it in a repo, a PR, a commit message, or a review comment that
lands in one.

## This is a reading pass, with grep as an index

Do not automate the verdict. A pattern cannot tell that "a large
financial-services customer is planning to migrate before the Q2 launch" is
unreleased customer information, or that a `**Meetings**:` header is provenance
that should not be public. Paraphrase is the normal way this leaks, and
paraphrase is invisible to patterns.

But grep is still the right way to *find candidates* in a large diff. Use it for
inventory, then read every hit and judge it:

```bash
# Tier 1 candidates
grep -rnE '[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|https?://|BEGIN [A-Z ]*PRIVATE KEY' <paths>
# Tier 2 candidates
grep -rniE '\b(meeting|attendees|weekly sync|standup|internal|private|roadmap|launch|EAP|pre-GA|Q[1-4] 20|customer|partner|BU)\b' <paths>
# internal-looking hostnames
grep -rnoE '\b[a-z0-9-]+(-svc|\.internal|\.corp|\.local|[0-9]{1,3}(\.[0-9]{1,3}){3})\b' <paths>
```

A grep with zero hits is not a PASS. A grep with seventy hits is an index, not a
report.

## Tiers

Classify every claim before you publish it. Lower number, stricter handling.

| Tier | Sensitivity | Publishable? | Typical content |
|---|---|---|---|
| **Tier 1** | Most sensitive | **No** | Credential values, customer/partner data, employee or customer PII |
| **Tier 2** | Internal | **No**, unless the audience is internal or the owner approves | Ticket provenance, internal meetings, internal process and artifact names, unreleased plans, internal hostnames, system and security posture, architecture that maps how the product is deployed or attacked |
| **Tier 3** | Public | Yes — only once release approval for this content is recorded, never because the repository is public | Product documentation, integration guidance already released |

> **A public repository is not permission to publish.** Readable by anyone is
> not the same as approved for anyone to read. Unsure between two tiers -> use
> the **lower** number and ask the content owner.

## Procedure

Work through these steps in order. Do not skip to the verdict.

### 1. Establish the review surface

Collect everything that will become public, not just the source diff:

```bash
git fetch origin
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
git log origin/main..HEAD --format='--- %h%n%B'
gh pr view --json title,body | jq -r '.title, .body'
```

The PR body and commit messages publish alongside the code and are where
"follow-up from the 1:1 with <name> about <account>" usually gets written.
Nothing else in the repo checks them.

Also check the **generated** text: a bot summary (CodeRabbit, Copilot, a
release-notes generator) that paraphrases an internal ticket publishes the
paraphrase, and the reviewer who wrote the code never sees it.

If the diff exceeds roughly 1,000 changed lines, say so and review **file by
file**, listing at the end which files you read and which you did not. An
unqualified "clean" on a large diff is worse than no verdict.

### 2. Read as an outsider

For each changed file, read added and modified lines as a customer, a
competitor, or a journalist would. One question per hunk:

> What does this tell a stranger about our customers, our pipeline, our internal
> process, or our unreleased plans?

If the answer is "something only knowable internally", it is a finding.

### 3. Interrogate each category

**Tier 1 — remove before publishing**

| Category | Ask this | Action |
|---|---|---|
| Credential / private key | Token, key block, password, connection string? | Remove. Rotate if pushed. |
| Internal URL | Points at an internal wiki, VPN-only host, or internal board? | Public equivalent, or `<internal-link>` |
| Personal data | Email, phone, employee name, customer contact? | Remove; reference a role |
| Customer / partner names | Real account, org, or unapproved logo? | Replace with a role: "a large financial-services customer" |

**Tier 2 — decide deliberately, often trim**

| Category | Ask this | Action |
|---|---|---|
| Ticket provenance | Does prose cite a ticket for context, not tracking? | Allowed **only if the issue is publicly viewable** — check with step 4 |
| Internal meetings | `**Meetings**:`, `**Deciders**: <forum + date>`, "weekly sync", attendees? | **Cite the decision, not the forum.** Keep the conclusion; drop the who/when |
| Internal notes | "internal notes", "not published", "internal only", pointer to a private doc? | Remove the reference; if the material is needed, summarize it in place |
| Unreleased plans | Dates, embargoes, launch/GTM plans, reorg or headcount? | Remove entirely. Paraphrase still leaks. |
| Internal codenames | Pre-public project or product name? | Public name or generic description |
| Internal artifacts | Names of private repos, private skill names, internal record or review-board names? | Generic description: "the team's private process repository" |
| Meeting transcripts | Speaker labels, "Attendees:", pasted notes? | Never paste; summarize the decision |

### 4. Verify the two things that are checkable

**Ticket and branch reachability.** Reachability is necessary and *not*
sufficient. A key that opens is still provenance: it tells a stranger there is a
backlog entry behind this document, with a status, an owner, and a plan. Treat
ticket identifiers as Tier 2 unless the content owner rules otherwise, and check
whether the thing cited actually resolves:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<jira-host>/browse/<KEY>
gh api repos/<owner>/<repo>/branches/<branch> --jq .name   # 404 = dangling
```

A key a stranger cannot open, a branch or PR that returns 404, or a reference to
a repository that is not public is a defect either way: it is provenance if it
resolves, and a dangling pointer that advertises a private artifact if it does
not.

**Hostnames.** `localhost`, `example.com`, `*.invalid`, and RFC 2606 names are
examples. Anything else that looks like a service name is a question, not an
example — ask whether it is fictional before accepting it.

### 5. Judge the collection, not only the lines

Every file can pass and the set still fail. A document that names where secrets
are stored, another that names the admin bootstrap variables, another that names
the restart path — no single line leaks a credential, and together they are a
map of how the system is deployed and attacked. Ask once per change:

> If I read only this set, could I describe the internal system, its operations,
> or its governance to someone who has never worked here?

If yes, the composition is Tier 2 even when every line is Tier 3. Record it as
one finding naming the files, not as scattered trivia.

### 6. Check the surfaces that hide

- **Test fixtures and mocks** — values copied from a real environment
- **Scaffolder templates and `app-config` defaults** — real hostnames, org IDs, account identifiers
- **Examples in guides** — a real customer value pasted as "an example"
- **Changelogs** — a change described in terms of an unnamed customer
- **Images, screenshots, alt text** — a ticket or dashboard screenshot carries more than the prose around it
- **Filenames and directory names** — a codename in a path survives every search of file bodies
- **Nav and index files** — `mkdocs.yml`, `docs/*/index.md` can surface a page that is otherwise unpublished
- **Text you are about to write** — this pass covers your draft, not just what exists

### 7. Record findings

Use this shape exactly. The verbatim quote is what makes the review auditable:

| File:line | Tier | Category | Quoted text | Why it matters | Suggested replacement |
|---|---|---|---|---|---|
| `docs/adrs/common/<nnn>-<slug>.md:12` | 2 | Internal meeting | `- **Meetings**: <TICKET> discussions <date> and <date> (internal notes not published)` | Names an internal forum and two dates, and confirms unpublished notes exist | Delete the line; the decision stands in the Decision section |
| `docs/adrs/common/<nnn>-<slug>.md:74` | 2 | Internal hostname | `baseUrl: http://<service-name>:9090` | An unbracketed service name reads as a real deployment | `baseUrl: https://compliance.example.com` |
| `docs/adrs/host/001`-`005` (set) | 2 | Composition | — (no single line) | Individually benign; together a map of storage, secrets, bootstrap, and restart | Record as one finding; the owner decides whether the set is releasable |

Never summarize a finding as "some provenance". Quote it.

### 8. Verdict

End with one of these plus what must change before merge:

- **BLOCK** — at least one Tier 1 finding. Remove it; do not paraphrase it.
- **TRIM** — Tier 2 findings only. Apply the replacements, or state explicitly why the audience makes them acceptable.
- **PASS** — nothing above Tier 3 *and* release approval for this content is recorded elsewhere. List what you read and what you did not. A PASS is a classification result, not an approval.

## Calibration cases

Judge these before your first real review; if your answers differ from the
stated verdict, re-read the tier table.

**A. PASS.** `docs/adrs/common/013-plugin-factory-enablement-defaults.md` — an
ADR that describes Preview/GA enablement defaults as a general product
lifecycle, cites no ticket, names no dates, customers, or forums, and maps no
internal system.
*Verdict: PASS. Lifecycle vocabulary is Tier 3; a ticket key would have made it
TRIM.*

**B. TRIM.** An ADR whose decision is sound and needed, but whose page names the
team's private process repository, lists its private `skills/` layout, and names
an internal tool.
*Verdict: TRIM. Keep the rule ("skills do not live in this repo"); describe the
private layout generically, and cut the symlink recipe that only applies there.*

**C. BLOCK.** A guide section reading "Per the Q3 summit plan, the financial
services account will migrate before GA — see the internal notes."
*Verdict: BLOCK. Unreleased customer plan plus pointer to internal material.
Delete the sentence outright; there is no remediation by rewording.*

## Judgment rules

- **Unsure between two tiers -> use the lower number.** Ask the owner.
- **Do not invent.** An unrecognized proper noun is a question, not a decision.
- **Paraphrase is not remediation.** A reworded unreleased plan is still an unreleased plan. Tier 1 is removed, not disguised.
- **Trim provenance, keep substance — verify, do not assume.** Safe to delete a `**Meetings**:` line *only if* the decisions it introduced still live in the body. List each decision the forum produced and point at the paragraph that now carries it; if any has no home, move it into prose first.
- **Never name the internal classification scheme.** Tier 1/2/3 here are deliberately abstract and carry no source. Do not write the scheme's name, its own tier or label names, the wiki or intranet URL that defines it, the name of the approval route, or a screenshot of any of the above into any repository, PR, commit message, or review comment that lands in one. If you need the mapping, keep it outside the repo. The same applies to review write-ups: a findings document that names the scheme is Tier 2 and does not belong in the pull request.
- **Write for the reader, not the archive.** An ADR is a decision record; the meeting that produced it is not part of the decision.
- **Re-read after editing.** Fixes introduce text. Re-run steps 2-7 on the amended diff.

## Where this runs

A skill that nothing invokes is documentation, not a control. Pick the layers
that exist in the target repo:

| Layer | Mechanism | Catches |
|---|---|---|
| Agent, pre-PR | This skill, invoked by an `AGENTS.md` instruction | Documents the agent is about to write |
| Agent, any time | Skill directory discovered by the harness | Same, when the agent is told to look |
| Reviewer PR check | `.coderabbit.yaml` `custom_checks` + `path_instructions` scoped to docs paths | Prose added by a human or a bot |
| Human PR check | One line in the PR template | Whatever the author remembers |

**Placement caveat.** In `ansible-backstage-plugins`, ADR-007 puts agent skills
in the Portal team's private process repository, not this one. A public guard for
public contributors contradicts that ADR unless it is amended — decide the home
deliberately (private repo, or amend ADR-007) rather than dropping a `SKILL.md`
where no agent looks.

## If something is already merged

Do not open a quiet deletion PR — that leaves the content in git history and
draws attention to it. Report it privately per `SECURITY.md` so history can be
rewritten deliberately.

## Limitations — be honest about them

- **This is a judgment pass, not a gate.** No exit code, nothing enforces it. It works only when invoked, so invoke it before every PR — including small "just a docs fix" ones, which is where context usually slips in.
- **Recall depends on the reviewer.** Large diffs get sampled. Say what you did not read rather than implying coverage.
- **It cannot know your customer list, codenames, or roadmap.** Those live outside the repo. When they are missing, ask.
- **Not a sign-off.** PASS is a review record, not the content owner's approval. Human review remains required, especially for agent-written prose.
