# Third-party plugins

Authoring contract for **BU-approved product-team plugins** that are not part of the Automation Portal base plugins. Those plugins live in **other repositories**. The target load path is RHDH dynamic plugins against the Portal SDK (**specified**; npm packages are **not yet** shipped).

This is not an open vendor marketplace. Partner and broader RHDH ecosystem plugins are out of scope unless the BU explicitly approves them.

## Start here

1. [Plugin development guide](plugin-development-guide.md) — walkthrough, Portal-vs-RHDH delta, SDK map, refusals
2. [Common ADRs](../adrs/common/index.md) — binding for every factory plugin
3. [Third-party ADRs](../adrs/third-party/index.md) — extra obligations because the plugin is out of tree ([ADR-028](../adrs/third-party/028-out-of-tree-plugin-obligations.md))
4. [Host ADRs](../adrs/host/index.md) — skip unless you are changing the host contract

## Honesty tags

| Tag           | Means                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| **shipped**   | Authors can do this against current Portal/RHDH behavior                   |
| **specified** | Target contract; describe it; do not invent a private substitute           |
| **not yet**   | Unanswered mechanism; fail closed; do not guess YAML, pipelines, or owners |

Several rows in the guide are **specified** and not yet shipped (SDK npm packages, scaffolder field-registry merge, packaging). The guide still states the contract so authors do not ship a stock RHDH plugin and call it a Portal plugin.

## Escalate only for host contract changes

Contact Portal engineering only for a new Experience, a new Blueprint family, a new semantic region, or a new host API version. Placement inside an existing Experience is host policy, not an authoring question.
