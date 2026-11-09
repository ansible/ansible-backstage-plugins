# UI decision tree for Portal plugins on RHDH 2.1+

> **Status:** Draft for review — all sections written **Scope:** When to
> configure, reuse, compose, or build UI in the Automation Portal on RHDH 2.1+
> with the Backstage new frontend system (NFS) **Program:** Portal BUI adoption
> **Audience:** Plugin developers, UX, and engineering leadership (each term is
> defined for code readers and for product readers)

This document is the shared reference for one question: _we need some UI — what
is the smallest thing we can do?_ It starts with the framings people disagree
about before they disagree about solutions: the three things "RHDH" means, the
shelf we work from, and the words we use for what is on it. "It's just a
blueprint" is the canonical example, a true statement about one layer of the
stack and a silent statement about another.

## How to read this

Every term below has a one-line definition, then up to three bullets:

- `Code:` — the construct a developer would type;
- `In RHDH:` — what the same thing looks like to someone who uses or funds the
  product, with no code involved;
- `Store:` — where it sits in the hardware store described in section 0, for a
  reader who knows RHDH as a user rather than as a codebase.

Sections A to D carry all three bullets. Sections E to G omit `Store:`, because
those terms are about how we decide and talk, not about things on a shelf.

Provenance is stated once per section: _upstream_ (Backstage), _RHDH_ (Red Hat
Developer Hub), or _program_ (our own vocabulary, with no construct behind it).
Where a term differs from its section, a tag follows the name, for example
**Surface** _(program)_. Program terms are the dangerous ones: they sound
technical and are not.

A term is defined once, in section 1. Sections 2 onward use only those terms;
when a new one is needed, it is added to section 1 first. If a sentence in this
document needs a word that is not defined below, the sentence is wrong, not the
vocabulary. Terms recorded in section 1.G are not defined and cannot be used
until they move into sections A to F. Metaphors count as terms: a coined word
such as a ladder or a rung is either defined in section 1 or replaced with plain
language.

All examples are drawn from shipped RHDH and Backstage code, verified against
`redhat-developer/rhdh@0ebef90` and `backstage/backstage@d8ca292`.

## 0. Three things called RHDH

RHDH is used to mean three different things, and most arguments about UI begin
by confusing them.

- **The product** — what Red Hat ships, supports and upgrades. Not negotiable.
- **The constructs** — plugins, blueprints, primitives, extension points and
  host services. These are domain-neutral: Catalog does not care whether an
  entity is a Component, a playbook project or an execution environment.
- **The default composition** — which pages exist, what they are titled, what
  order the navigation is in, and what the Home page shows. This is a reference,
  not a specification.

The default composition is evidence of what the constructs can do, not a
statement about who they are for. Adopt the constructs; compose your own
experience.

That is the ambition for the Automation Portal: a composition of RHDH
constructs, not a fork of RHDH. Same product underneath, assembled into an
experience for automation content.

**The hardware store.** Think of RHDH as a hardware store that already has a
specific set of tools and materials on the shelf. That shelf is the initial
limit: solve the problem with something on it where you can. Assembling those
materials into a project the store has never sold is composition, and it is the
usual answer. Section 1 lists what is on the shelf, construct by construct, with
the store's counterpart beside each one.

What you should not do is go to a different store: a second design system beside
the platform's, or a separate app that only looks like RHDH. If a tool is
genuinely missing, order it, which means filing upstream, and use the closest
available item until it arrives. If you must fabricate a part, say in one
sentence why, and offer the design back to the store so that nobody fabricates
it twice.

For a third-party plugin author this is the exchange being offered: use the
platform's materials and you inherit the platform's maintenance; bring your own
and you own them for as long as your plugin ships.

The metaphor stops here. "Store" and "shelf" are not terms in this document;
they only help place the real terms, which begin in section 1.

## 1. Vocabulary

### A. Composition — the parts list

The app is assembled from features; features are assembled from extensions;
extensions are produced from blueprints. Everything in this section is
**upstream**.

**App instance** — the whole assembled product.

- `Code:` `createApp({ features: [...] })` in `packages/app/src/App.tsx`.
- `In RHDH:` the screen you land on when you open the Developer Hub URL.
- `Store:` the finished project, assembled and standing in the room.

**Feature** — one installable box in the product.

- `Code:` entries in the `features:` array — `catalogPlugin`, `searchPlugin`,
  `homePagePlugin`.
- `In RHDH:` Catalog, Search, Home, Settings — each could be absent from a given
  deployment.
- `Store:` a boxed kit on the shelf: take the whole box or leave it.

**Plugin** — a feature that owns its identity and pages.

- `Code:` `createFrontendPlugin({ pluginId: 'scaffolder', extensions: [...] })`.
- `In RHDH:` the thing that owns "Software Templates" and everything under it.
- `Store:` a boxed kit that comes with its own aisle and its own signage.

**Module** — a feature that adds to someone else's plugin.

- `Code:` `createFrontendModule(...)`; for example `catalogCreatedAtModule`.
- `In RHDH:` the "Created At" column appearing in the catalog table, added
  without owning Catalog.
- `Store:` an add-on pack that fits a kit you already bought.

**Feature override** — the supported way to change someone else's feature.

- `Code:`
  `scaffolderPlugin.withOverrides({ title: 'Self-service', extensions: [scaffolderPage] })`;
  `catalogImportBase.withOverrides({ title: '', icon: false })`.
- `In RHDH:` the Create page is titled "Self-service", and "Import Git" is
  hidden from the sidebar — both shipped, neither forked.
- `Store:` a reprinted label for a kit, applied before it reaches you.

**Extension** — the smallest thing the app wires up.

- `Code:` an object with an ID, inputs and output; `page:scaffolder`,
  `sub-page:scaffolder/templates`.
- `In RHDH:` the "Templates" tab and the "Tasks" tab are two separate extensions
  inside Software Templates.
- `Store:` one part, already fitted into the assembly.

**Extension blueprint** — a typed template for making an extension; it carries a
contract and defaults, and no visuals.

- `Code:` `PageBlueprint.makeWithOverrides({ inputs, factory })`,
  `SubPageBlueprint.make({...})`.
- `In RHDH:` the Self-service page is the stock page re-declared with a new
  title — the blueprint turns that into a twenty-line change instead of a fork.
- `Store:` the mould a part is cast from, a shape rather than a part.

**Extension data ref** — the labelled item an extension hands to its parent.

- `Code:` `FormFieldBlueprint.dataRefs.formFieldLoader`.
- `In RHDH:` why a newly added template field type appears in every template
  form without anyone editing those forms.
- `Store:` the standard thread that lets two parts screw together.

**Extension input / extension point** — a named attachment point a parent offers
for others to fill; commonly called a slot.

- `Code:` `createExtensionInput([...], { singleton: true, optional: true })`.
- `In RHDH:` how a plugin can add template filtering to the stock templates page
  without owning that page.
- `Store:` an empty socket on a part, sized to take an accessory.

**Route ref** — a bookmark to a page that survives the page moving.

- `Code:` `createRouteRef({ aliasFor: 'scaffolder.root' })`.
- `In RHDH:` links to "Create" from other pages keep working after RHDH
  re-declares the page.
- `Store:` the address label on a box, so moving the box does not lose it.

**Config schema** — knobs an administrator can turn without code.

- `Code:` `configSchema` with zod; the operator side is `app.extensions`
  entries.
- `In RHDH:` disabling a page, reordering the sidebar, or changing a title
  through configuration alone.
- `Store:` the label that says what the item is and how much of it you may take.

**Utility API** — a service supplied the same way as UI.

- `Code:` `ApiBlueprint`; `rhdhApisModule` (storage), `translationsApiModule`.
- `In RHDH:` your dark-mode preference and language choice persist across
  sessions.
- `Store:` water and power, supplied through the same wall as the shelves.

**Feature discovery and dynamic loading** — the app finding what is installed.

- `Code:` `app.packages: all`; `dynamicFrontendFeaturesLoader()`.
- `In RHDH:` adding a plugin to the configuration and seeing it appear after
  restart, with no new image.
- `Store:` the stock list, read when the store opens.

**Installed vs registered** — installed means the package is present in the
build or image; registered means the app has actually mounted its extensions.

- `Code:` installed is a dependency; registered is an entry in `features: []`,
  or a match through `app.packages` or `app.extensions`.
- `In RHDH:` a plugin can be in the image and still be absent from the sidebar
  until it is enabled in configuration.
- `Store:` in the stockroom versus out on the shelf.

**Wiring** — the configuration that makes an installed extension reachable.

- `Code:` entries in `features: []`, `app.packages`, or `app.extensions`.
- `In RHDH:` enabling a plugin in configuration so its page appears in the
  sidebar.

### B. Delivery — how parts reach the customer

Same constructs, different packaging, hosting and ownership. Everything in this
section is **RHDH**, except where a term is marked otherwise.

**Authorship** _(program)_ — who wrote the code that declares an extension. It
is a separate question from who ships it and who composes the app, and only
authorship determines where a fix can be filed.

- `Code:` the package scope is the first hint: `@backstage/*` is upstream,
  `@red-hat-developer-hub/*` is Red Hat, `@ansible/*` is ours.
- `In RHDH:` RHDH ships `@backstage/plugin-scaffolder` but does not author it;
  it ships the global header, which it does author.
- `Store:` the maker's stamp on the part, which decides who honours the
  warranty.

| Question         | Values                              | What it decides                   |
| ---------------- | ----------------------------------- | --------------------------------- |
| Who ships it?    | the RHDH image, or a dynamic plugin | how it is updated                 |
| Who authors it?  | Backstage upstream, Red Hat, or us  | which repository an issue goes to |
| Who composes it? | the RHDH host app, or a portal app  | who can override it               |

**RHDH host app** — Red Hat's own assembled app.

- `Code:` `packages/app` in `redhat-developer/rhdh`.
- `In RHDH:` the product as installed via the Operator or Helm chart.
- `Store:` the store's own showroom, laid out by the staff.

**Dynamic plugin** — a plugin packaged for download rather than compiled in.

- `Code:` a plugin image plus a `dynamic-plugins.yaml` entry, loaded by the
  dynamic feature loader.
- `In RHDH:` the plugins a customer adds after installation; same UI, delivered
  differently.
- `Store:` a part delivered after the store was built.

**Legacy mount-point configuration** — the retiring YAML model.

- `Code:` `dynamicPlugins.frontend` with `mountPoints`, `dynamicRoutes`,
  `menuItems`, `routeBindings`.
- `In RHDH:` the way customers used to say "put this card on the entity overview
  page"; the model the 2.1 migration retires.
- `Store:` the old shelving plan, still up in a few aisles.

**Scalprum** — the old runtime loader behind that YAML.

- `Code:` the legacy dynamic-plugin loader.
- `In RHDH:` invisible, but it is why older customisations cannot be reordered
  the way modules can.
- `Store:` the old forklift; it still moves a few pallets.

**Stock RHDH plugin** — something Red Hat already ships.

- `Code:` `@red-hat-developer-hub/backstage-plugin-global-header`,
  `@red-hat-developer-hub/backstage-plugin-dynamic-home-page`.
- `In RHDH:` the global header with search and the user menu; the customisable
  Home page; the quickstart checklist.
- `Store:` an item the store stocks itself, under its own brand.

**Theme module** — the app-wide look, always on.

- `Code:` `rhdhThemeModule` from
  `@red-hat-developer-hub/backstage-plugin-theme`.
- `In RHDH:` light and dark themes and brand colours applied across every page
  at once.
- `Store:` the paint and lighting applied to the whole store at once.

### C. Surfaces — what a person sees

This is the layer the decision tree operates on. A page is not a component, and
a card is not a page. **Upstream**, though the words are ours, except where a
term is marked otherwise.

**Surface** _(program)_ — anywhere a person looks, at any size: shell, page,
sub-page, section or card. Used when the size does not matter yet.

- `Code:` no single construct; the decision tree always resolves a surface to
  one of the entries below.
- `In RHDH:` "the Software Templates page" and "the card on the Overview tab"
  are both surfaces.
- `Store:` somewhere in the store you look at, of any size, no size implied.

**App shell / chrome** — header, sidebar, sign-in screen.

- `Code:` app root wrapper, `NavContentBlueprint`, `SignInPageBlueprint`.
- `In RHDH:` the top bar and left sidebar that stay put as you move between
  pages.
- `Store:` the front door, the aisle signs and the counter.

**Page** — a full screen with its own address; the only kind that gets a sidebar
entry.

- `Code:` `PageBlueprint`, producing `page:scaffolder`.
- `In RHDH:` "Software Templates", "Catalog", "Search", "Settings" in the
  sidebar.
- `Store:` a whole room, with its own number on the door.

**Sub-page** — a screen nested inside a page.

- `Code:` `SubPageBlueprint`, producing `sub-page:scaffolder/templates`.
- `In RHDH:` the Templates / Tasks / Actions tabs under Software Templates; the
  General tab in Settings.
- `Store:` an alcove inside a room.

**Route** — the address a surface answers to.

- `Code:` the `path` on a `PageBlueprint` or `SubPageBlueprint`; code refers to
  it through a `Route ref` rather than by string.
- `In RHDH:` what appears after the host name, and what people bookmark.
- `Store:` the room number.

**Section / panel** — a region inside a page with no address of its own.

- `Code:` a component rendered by a page, for example `CustomCatalogFilters`.
- `In RHDH:` the filter column down the left of the catalog list.
- `Store:` a display table inside a room.

**Card / widget** — a self-contained block.

- `Code:` `HomePageWidgetBlueprint`, `EntityCardBlueprint`.
- `In RHDH:` the drag-and-drop cards on Home; the cards on a component's
  Overview tab.
- `Store:` a boxed display you can pick up and set down elsewhere.

**Action / header action** — a button-level contribution.

- `Code:` `PluginHeaderActionBlueprint`, `EntityContextMenuItemBlueprint`.
- `In RHDH:` the create button in the header, or "Add repository" on a plugin's
  page.
- `Store:` a labelled button on the wall.

**Nav item** — a sidebar entry.

- `Code:` derived from the page's `title` and `icon`; or `NavContentBlueprint`.
- `In RHDH:` hiding "Import Git" works by blanking the page's title and icon —
  there is no separate menu configuration any more.
- `Store:` the sign over the door.

**Form field / decorator** — an input inside someone else's form.

- `Code:` `FormFieldBlueprint`.
- `In RHDH:` the repository picker and owner picker inside a template form.
- `Store:` a blank on the form you fill in at the counter.

**Dialog** — a modal, owned by a component rather than by a construct.

- `Code:` rendered by whatever component opens it.
- `In RHDH:` the template editor, or the confirmation that appears over the page
  when you start a template.
- `Store:` a small window that opens over the counter and then closes.

### D. Rendering — what becomes pixels

Below the loader, none of the composition constructs apply. **Upstream**, plus
**RHDH** for the theme.

**Loader** — the lazy handoff between "the extension exists" and "this is what
it looks like."

- `Code:` `loader: () => import('./X').then(m => <m.X />)`.
- `In RHDH:` pages appear quickly because their code is fetched only when
  opened.
- `Store:` the clerk fetching the item from the back only when you ask.

**Component** — the actual drawing.

- `Code:` `GeneralPage` in
  `packages/app/src/modules/user-settings/GeneralPage.tsx`.
- `In RHDH:` the Settings → General screen you look at.
- `Store:` the item as actually built, in your hands.

**Primitive / kit** — the packaged visual vocabulary.

- `Code:` `@backstage/ui` (BUI), `@backstage/core-components`, `@mui/material`,
  PatternFly.
- `In RHDH:` why two pages can look subtly different; this is the layer that BUI
  adoption actually changes.
- `Store:` the raw stock and standard fittings everything else is made from.

**Swappable component** — a named rendering decision someone else can replace.

- `Code:` `TemplateCardComponent`, `SwappableComponentBlueprint`.
- `In RHDH:` RHDH's template card can differ from upstream Backstage's without
  forking the page.
- `Store:` a part with a standard fitting, so another make also fits.

**Theme, icons, translations** _(upstream / RHDH)_ — the shared visual and
language assets.

- `Code:` `ThemeBlueprint`, `IconBundleBlueprint`, `TranslationBlueprint`;
  `rhdhTranslationsModule`.
- `In RHDH:` dark mode, and the UI rendered in German, Spanish, French, Italian
  or Japanese.
- `Store:` paint, signage symbols, and the languages the labels print in.

### E. Our program words

These have no construct behind them. They are how we make and record decisions,
and they must not be used as if they were implementation terms. **Program**.

**Journey** — the user's task end to end.

- `Code:` not a construct; measured across pages.
- `In RHDH:` "create an execution environment", from the sidebar entry to the
  finished job.

**Page archetype** — the agreed layout pattern for a page type (collection,
detail, wizard, dashboard).

- `Code:` not a construct; a design decision recorded before engineering.
- `In RHDH:` the familiar "filters on the left, results on the right" collection
  layout used by Catalog.

**Level of reuse (L0–L6)** — how much existing product a change reuses, from
configuration only up to a new plugin. Enumerated in section 2.2. Each level is
a rung, and the ordered set of rungs is the ladder; both words mean only this.

- `Code:` not a construct; the gate this document adds.
- `In RHDH:` renaming a page, re-declaring a page, and downloading a new plugin
  are all everyday visible things — they just cost very different amounts.

**Carrying cost** — the recurring cost of owning a surface: revalidating it
against each release, triaging breakage, maintaining its tests, and supporting
its users. _program_

- `Code:` no construct; it is revalidation work repeated over time.
- `In RHDH:` the custom cards that must be retested on every upgrade, while the
  stock Catalog page does not.

**Reversal cost** — the one-time cost of removing a surface after it ships:
routes, nav items, user habits, and any code that links to it. _program_

- `Code:` no construct; it is a retirement estimate.
- `In RHDH:` telling users that a page they bookmarked is going away.

**Disposition** — the decision about one piece of existing UI: Replace, Wrap,
Keep, or Contribute upstream.

- `Code:` a registry field.
- `In RHDH:` replacing a hand-built table with the stock catalog table is
  Replace; keeping a bespoke dialog is Keep, justified.

**Custom surface** — UI whose look we own and must maintain across upgrades.

- `Code:` not a construct; measured by visual ownership, not by who wrote the
  code.
- `In RHDH:` a page built from stock cards is not custom; a stock card buried
  under heavy CSS is.

**Registry entry / tier** — the written record and the measurement bucket.

- `Code:` audit record fields.
- `In RHDH:` the answer to "how much of our UI is bespoke, and is it going
  down?"

### F. Sounds like UI, isn't

**Software template** — the catalog entity the page lists.

- `Code:` kind `Template`, `v1beta3`.
- `In RHDH:` each card you click on the Software Templates page is a template;
  the page itself is not one.

**Scaffolder action / task** — a step in a template, and a run of one.

- `Code:` a backend action; a task record.
- `In RHDH:` the "Tasks" tab showing the runs you started, which is a different
  tab from Templates.

### G. Terms awaiting definition

Words that have appeared in program discussion without an agreed meaning. They
are recorded here so that nobody invents a definition for them mid-argument.
None of them may be used in a decision in this document until it is defined and
moved into sections A to F.

**Compass** — _awaiting definition_. The word has been used without saying what
it refers to. It has not been established whether it names a product capability,
a screen, or a section of a UX prototype, and in discussion it was not qualified
as "PR Compass".

- `Code:` none.
- `In RHDH:` unknown. Prototype paths such as `/pr-compass/mvp/prototype` exist,
  but a path is not a definition.

## 2. Framing

### 2.1 The three axes

Every UI change has three independent properties. Most arguments in this area
are two people answering different ones, each correctly.

**Architecture** — how it attaches to the host. Two options: a legacy mount
point, or an extension produced by a blueprint. This is not a design decision;
it is a migration requirement set by the host. The consequence: "it's just a
blueprint" answers this axis and no other, so it can be true while the change is
entirely custom in appearance.

**Surface** — what it looks like, and who owns that look. From stock to bespoke:
a stock primitive, then a composition of stock primitives, then a stock
primitive with CSS overrides, then a bespoke component. A stock primitive with
non-trivial CSS is custom surface, which is why this axis is measured by who
owns the look rather than by who wrote the code. This is the axis the drift
check measures.

**Journey** — how a person gets there. From embedded to a new page: a
contribution inside an existing surface with no `Route` of its own, then a stock
page with a stock `Nav item`, then a stock page with a custom `Nav item` or
`Action`, then a new page with a new `Nav item`. This is the axis UX owns, and
the most expensive one to reverse, because people bookmark routes and learn nav
items.

| Axis         | Question             | Decided by                       | Carrying cost | Measured by     |
| ------------ | -------------------- | -------------------------------- | ------------- | --------------- |
| Architecture | how does it attach   | nobody; it is a host requirement | none          | not measured    |
| Surface      | who owns the look    | engineering                      | low to high   | the drift check |
| Journey      | how people get there | UX                               | highest       | registry level  |

**Every decision states a position on all three axes.** A complete position has
no adjectives in it, for example: stock page, stock components, stock nav item,
one configuration predicate. Anything shorter is answering one axis and leaving
the others to be inferred, which is how the same proposal can sound cheap to one
person and expensive to another.

Three common partial statements:

- "It's just a blueprint" — architecture only.
- "It's just a filter" — architecture and surface, silent on journey.
- RHDH renaming "Create" to "Self-service" — architecture unchanged, surface
  unchanged, same route and same nav item. A change a user can see that moves
  nothing on any axis, which is exactly why it was cheap.

### 2.2 Ordering by carrying cost

The tree walks a fixed order of options and stops at the first one that is good
enough. The order is carrying cost.

A stock surface is maintained and tested upstream. A surface we build is
maintained and tested by us, on every RHDH release, with whatever staff we have
at that time. That difference, repeated across a release cadence, is the
dominant cost of custom UI — larger than the effort to build it and larger than
the effort to remove it.

**Reversal cost sets the tiebreaker, not the order.** Removing something after
it ships is a real cost: routes get bookmarked, nav items get learned, other
code links in. But it is paid once, by whoever refactors later. Carrying cost is
paid every release, by whoever is on staff then. The two can also point opposite
ways: adopting a stock page that upstream later deprecates carries nothing while
it lasts, yet is expensive to reverse once users depend on it. That case is why
both costs are recorded rather than collapsed into one number.

The ladder, expressed as carrying cost:

- **L0** — configure an existing extension: title, icon, order, filter
  predicates. Nothing to carry; the surface is not ours.
- **L1** — reuse a whole stock page with its stock nav item. Nothing to carry
  but the configuration that enables it.
- **L2** — reuse a stock sub-page, or swap one nested component. Carry the
  swapped component only.
- **L3** — contribute into a surface someone else owns: entity tab, card, home
  widget, nav item, action. Carry our contribution, revalidated against the
  host's releases.
- **L4** — compose a new page or sub-page from stock primitives. Carry the page,
  its route, its nav item, and its test coverage; the components stay
  upstream's.
- **L5** — a new page with bespoke components. Carry L4 plus the look, the
  interactions, and their tests.
- **L6** — a new plugin. Carry L5 plus packaging, delivery and upgrade
  coordination.

**"Largest surface first" is only a proxy.** The largest applicable surface
usually contains most of what the journey needs, so exhausting it is the fastest
route to the cheapest answer. But size is not the rule, and the largest surface
is the wrong starting point when it does not own the shape of the journey
(section 2.4). "Applicable" means that it does.

**Stock is not free either.** A stock surface that forces a bad workflow carries
its own recurring cost: support load, workarounds, and users going around the
product. The comparison is always between two carrying costs, never between
"some custom UI" and "no custom UI".

**Both directions are drift.** There are two ways to avoid a cheap answer:
customise the stock surface until it is bespoke, or leave the stock surface
alone and build a new one. The first adds custom surface without adding a route;
the second adds a route without adding custom surface. A registry that measures
only one of them rewards the other, which is why an entry records `level`, the
number of custom surfaces the change introduces, and the surface that must be
revalidated (section 4).

**The order is walked, not negotiated.** A decision that skips a level states,
in one sentence, why the skipped level is not good enough. That sentence is the
record. Without it, "we considered it" and "we did not think of it" are
indistinguishable, which is the state the execution-environment discussion
started in.

### 2.3 Gap classification

This section applies only once a surface already hosts the journey, meaning
section 2.4 has found a native surface that performs the shape of the step. When
that surface does not do what the goal needs, the gap is one of three kinds. The
kind is not cosmetic. It determines who fixes it, how long that takes, whether a
local workaround is affordable, and which repository an upstream issue belongs
in. None of the three labels is a construct: they never appear in code, and they
are not vocabulary from section 1.

The three labels map onto terms defined in section 1:

| Gap label         | Term that defines it              | Section |
| ----------------- | --------------------------------- | ------- |
| missing wiring    | Wiring; Installed vs registered   | A       |
| missing slot      | Extension input / extension point | A       |
| missing primitive | Primitive / kit                   | D       |

**Missing wiring** — the extension exists in the installed package, but the app
has not registered or enabled it.

- `Code:` the export exists, but there is no matching entry in `features: []`,
  `app.packages`, or `app.extensions`.
- `In RHDH:` a plugin is present in the image and still absent from the sidebar
  until an administrator enables it in configuration.

**Missing slot** — the surface is the right place for the content, but the
plugin that owns it declares no extension point for content of that kind.

- `Code:` the owning extension has no `createExtensionInput(...)` accepting the
  extension data ref you need to supply.
- `In RHDH:` the templates sub-page accepts `formFields` and a template filter,
  but has no input for a banner or a notification.
- `Fix lives in:` the repository that authors the plugin declaring that surface
  — `backstage/backstage`, `redhat-developer/rhdh-plugins`, or this repository.

**Missing primitive** — `@backstage/ui` has no component that does this, and no
arrangement of existing components reproduces it.

- `Code:` no `@backstage/ui` export matches the need, and no composition of
  existing components plus the theme's values (colour, spacing, type) reproduces
  the behaviour.
- `In RHDH:` there is no notification component to compose from at all.
- `Fix lives in:` `backstage/backstage` for `@backstage/ui`, or
  `redhat-developer/rhdh-plugins` for the theme.

**Check order: wiring, then slot, then primitive.** The cheapest explanation is
the most common one. "The header cannot show our button" is usually an
unregistered module, occasionally a missing input, and rarely a missing
component.

| Gap       | Who fixes it                      | Lead time         | Local workaround                  | Workaround cost            |
| --------- | --------------------------------- | ----------------- | --------------------------------- | -------------------------- |
| Wiring    | us, or the customer administrator | days              | none needed                       | none — it is configuration |
| Slot      | maintainers of the owning plugin  | weeks to quarters | a feature override of the surface | custom surface             |
| Primitive | upstream Backstage or RHDH design | quarters          | write a component                 | custom surface             |

Two misclassifications cause most of the damage:

- **Wiring treated as a primitive.** A component is written for something the
  product already ships, and is then maintained forever.
- **Slot treated as a primitive.** A whole page is forked to add a banner, when
  the honest request was one extension input upstream.

The classification also answers the question the tree asks at this point. It is
not "should we open a BUI pull request" but "which of the three is absent, and
therefore which repository owns the fix": `backstage/backstage` for a primitive
in `@backstage/ui`, the repository that authors the plugin for a slot, and the
host configuration for wiring.

Every registry entry records `gap` alongside `level`, so a run of slot gaps
across several journeys surfaces as one upstream ask instead of N local
workarounds.

### 2.4 Journey decomposition

Section 2.3 assumes something already hosts the journey. Ansible-domain journeys
rarely have an upstream owner: converting another tool's repository into Ansible
content is X2Ansible, and assessing the quality of Ansible content across a
fleet is APME. Both exist as surfaces we built — one as a page in
`rhdh-plugins`, one as entity tabs in this repository — which is what makes them
the interesting case. They are new to the product and not new in shape, and the
work is to see which of their parts are new content and which are new shape.

No journey is new in shape; it is new in content. Decompose the journey into
steps, then ask for each step whether a native surface already performs that
kind of step.

| Journey shape                  | Native surface that performs it | Extension kind                                  |
| ------------------------------ | ------------------------------- | ----------------------------------------------- |
| Find or pick something you own | Catalog                         | stock page                                      |
| Run a job from a repository    | Software Templates              | stock page and sub-pages                        |
| See the status of one thing    | entity page tab or card         | `EntityContentBlueprint`, `EntityCardBlueprint` |
| Compare many things            | Catalog-like collection page    | `PageBlueprint` over stock components           |
| Change account or org settings | Settings                        | stock sub-page                                  |
| Guided multi-step input        | scaffold template form          | `FormFieldBlueprint`                            |

**Converting a repository from another tool.** X2Ansible is this journey, built
as a page we own. Read that page against the decomposition rather than treating
it as a precedent: the steps are choose a repository, run a conversion, follow
progress, review the result. Choosing and running are Catalog and Software
Templates; progress is the stock task sub-page; the result is a card or a
section on that task page. The novelty is a scaffolder action and a template
entity, which are backend code and data rather than surface. The failure mode is
building a dedicated converter page when the product already has a job runner.

**Assessing content quality.** "Status of one thing" is the entity page: a tab
and a card. "Compare many things" is a collection page. That is the shape the
APME contribution already uses.

**Novelty in the domain does not imply novelty in the surface.** New domain
content attaches to existing surface shapes. Only a genuinely new shape, such as
a canvas editor or a side-by-side diff workbench, justifies a new surface, and
even then it composes from existing primitives.

**Exit.** If no native surface performs the shape of any step, the work is a new
product decision rather than a UI decision. It goes to Plugin Factory intake and
this tree stops. New user journeys are out of scope for this program.

## 3. The decision tree

Four gates, walked in order, stopping at the first good-enough answer. A person
walks the tree; its output is one paragraph that a reviewer can check against
the vocabulary in section 1. No gate is skipped, and no gate revisits what an
earlier one settled.

"Good enough" means one thing throughout: the person reaches the goal without a
surface we do not already own being created, and without visiting a surface that
exists only to hand them to another one. Moving between surfaces we already own
is normal — Appendix A does exactly that — and what the tree forbids is
inventing a doorway. Whether it is good enough on the journey is UX's call;
whether it is good enough on the surface is engineering's (section 2.1).

The tree is per change, not per programme. One journey routinely produces
several records, and the execution-environment work is three templates, one
predicate and one action, not one decision.

### 3.1 Gate 0 — which surface owns the journey?

Decompose the journey into steps, then look up each step's shape in the section
2.4 table. A step with a shape has an owner; this gate only asks whether every
step has one.

- **Every step has a shape.** Go to gate 1, starting from the surface that owns
  the step the journey is named after.
- **Some steps have a shape and some do not.** The shaped steps proceed at gate
  1. The unshaped one is either a genuinely new shape, which is the exception in
     section 2.4 and the subject of gate 3, or a product decision that goes to
     Plugin Factory intake. Appendix B is this case: the review workbench has no
     owner, and every step around it does.
- **No step has a shape.** Nothing to configure, reuse or extend. This is a
  product decision rather than a UI decision: it goes to Plugin Factory intake
  and the tree stops here.
- **The step is not a surface at all.** A scaffolder action, a backend plugin, a
  catalog processor, a permission. Section 1.F exists to catch this: it is built
  as backend code and data, and the UI question becomes how to show its result,
  which returns to the first case.

**Recorded:** the surface that owns each step, where the person enters the
journey, and any step that no surface owns. The entry point is part of the
decision, because it is often another journey's surface reached by an action.
When it is, the seam between the two journeys is the thing to look at in review
(Appendix A).

### 3.2 Gate 1 — what is the lowest level that is good enough?

Stay inside the owning surface and exhaust it before leaving it. The order is
carrying cost (section 2.2); only the levels inside a surface are in play here.

| Level | What you try                                                                    | Good enough when                                                       |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| L0    | configuration: title, icon, order, filter predicates                            | the surface already does it, with different settings                   |
| L1    | the whole stock page, with its stock nav item                                   | the stock page is the right page for the journey                       |
| L2    | a stock sub-page, or one swapped nested component                               | one part of the page needs replacing, not the page                     |
| L3    | a contribution into someone else's surface: tab, card, widget, nav item, action | the goal is one block of content or one action inside an existing page |

Walk the rows in order and stop at the first that is good enough. A change that
stops at L0 or L1 adds no surface of ours and carries only configuration.
Anything that stops at L3 carries one contribution, revalidated against the
host's releases.

**When the surface is not good enough, do not jump to a new surface.** Go to
gate 2 and name what is missing. "Ship with the gap" is a legitimate outcome
here and is recorded as a decision: a stock surface that is ninety percent right
and stays maintained usually beats one that is a hundred percent right and ours.

**Wrap and extend.** If the gap is real and the journey cannot wait, the next
move is still not a new page. It is a feature override of the owning surface
plus our contribution beside it: the stock page stays, and the missing piece is
added where the page allows it. That is L3 plus an override, and it is the only
local move that keeps the stock surface's carrying cost.

**Recorded:** the level, and for every level below it, in order, one line saying
why it was not adequate (section 4). That list is what section 2.2 means by the
sentence a skipped level requires; a rung with no named inadequacy is a rung
nobody considered. A more expensive level that somebody proposes later is
recorded the same way, so the proposal is answered rather than absorbed.

### 3.3 Gate 2 — what is actually missing?

Classify the gap with section 2.3 — wiring, slot or primitive — and take the
outcome that matches. There are three, and each one ends somewhere different.

- **Fix and continue.** A wiring gap: the capability is installed and not
  registered. Fix the configuration and return to gate 1's level. Nothing is
  carried.
- **Ask upstream and wait.** A slot or primitive gap with a deadline. The
  repository is decided by authorship, not by preference, and the deadline is
  what stops the wait from becoming the plan.
- **Ask upstream and work around.** The workaround needs one sentence of
  justification, and the upstream issue is filed anyway. The issue is what makes
  the workaround deletable; without it, the workaround is inherited.

**Present before building.** The gap analysis and the proposed workaround go to
the journey owner together, as a proposal, before any code. Reviewing a gap
analysis is cheap, and reviewing a built page is not.

**Recorded:** the gap, the author, the upstream issue, and either the deadline
or the justification.

### 3.4 Gate 3 — which primitive, if the level reaches L4?

Only a change that has already justified leaving the owning surface gets here,
and composition is the default. The questions are narrow.

- Does a `@backstage/ui` primitive already do this, alone or in combination
  (section 2.3, missing primitive)?
- Does the theme's values — colour, spacing, type — cover the difference, or is
  the difference a new visual idea?
- Is the new component doing something, or only reproducing something on the
  shelf under a different name?

Every custom component that survives these questions gets one sentence of
justification and a name in the registry, so that section 4 can count and
revalidate them.

**Recorded:** each custom component and its justification. Appendix B is a
change that reached this gate legitimately.

### 3.5 What the tree does not decide

- Whether the journey should exist. Gate 0 hands that to Plugin Factory intake.
- The content: which templates, which fields, which actions, which columns.
- Backend behaviour, data model and permissions.
- Naming beyond the one case the tree cares about, which is whether the change
  creates a nav item.

## 4. Recording a decision

One record per change, written when the decision is made and stored next to the
code, one file per record under `docs/ui-decisions/`. It is not a design
document; it is one screen. Section 4.4 is a filled record, and Appendix A is
the case it came from.

### 4.1 Fields

| Field                  | Holds                                                            | From      |
| ---------------------- | ---------------------------------------------------------------- | --------- |
| `goal`                 | the journey, and the surface the person enters it from           | gate 0    |
| `level`                | the rung the change stops at, L0 to L6                           | gate 1    |
| `alternatives`         | rungs, cheapest first, each with why it was not adequate         | gates 1–3 |
| `custom_surfaces`      | every surface we now own, named                                  | gate 3    |
| `revalidation_surface` | what has to be retested on each RHDH release                     | gate 1    |
| `reversal_cost`        | what removing it later costs: routes, nav items, links, habits   | gate 1    |
| `gap`                  | wiring, slot or primitive, or none                               | gate 2    |
| `author`               | upstream Backstage, Red Hat, or us                               | gate 2    |
| `upstream_issue`       | the issue that makes a workaround deletable, or none             | gate 2    |
| `justification`        | one sentence, wherever a rung was skipped or a component written | gates 1–3 |

When the levels disagree — a contribution into someone else's page that carries
a bespoke region inside it — `level` records the highest rung any part of the
change occupies, and `custom_surfaces` says where the bespoke part actually
sits. Appendix B.6 is that case.

### 4.2 The alternatives list

`alternatives` is the field that makes the rest reviewable. It is ordered
cheapest first, so the ladder was walked rather than sampled. Every rung below
the chosen level appears, because skipping one is what this document exists to
surface. Every rung above it that somebody actually proposed appears too,
because "we could just build a page" is a proposal to answer rather than absorb.
Each line carries its reason, so "we did not think of it" cannot be written in
the same words as "we considered it".

### 4.3 What the check can and cannot validate

The advisory drift check proposed in #1040 (`bui-baseline.yaml`,
`scripts/check-bui-drift.mjs`) reads source. It is not in CI yet; what follows
is what it will and will not prove once it lands. It covers one field only:
whether new non-BUI imports appeared, and whether the baseline grew. That is the
`custom_surfaces` ceiling, and it is a good ceiling, because it is the one
signal a machine can read honestly.

Everything else in the table is a claim about intent, and imports cannot see it.
A bespoke page written entirely in `@backstage/ui` produces no finding, and a
stock page with one configuration predicate produces no finding either. The
record exists precisely to hold what the check cannot:

- **`level`** is a claim about reuse, not about libraries.
- **`goal`** is a claim about a journey, which exists in no file.
- **`gap`** is a claim about what the product is missing, which is what makes an
  upstream ask possible at all.

So the two artefacts divide the work. The check enforces the ceiling on surface;
the record explains the position on the journey and on the gap. Neither
substitutes for the other, and a green check says nothing about whether the
decision was a good one.

There is a cheap enforcement left for the record itself, and it is worth doing
once there are enough records to be worth parsing: a schema check that fails
when a record omits a rung below its chosen level, or when an alternative has no
reason. That catches the one failure mode a reviewer reliably misses, which is
an incomplete ladder.

### 4.4 A filled record

The record for Appendix A, in full:

- **Goal:** create an execution environment, entered from the Create tab of the
  execution environments page.
- **Level:** L4, with an L5 region — a page of ours carrying a bespoke list.
  That is the current state, not a proposal; the proposal is to come back down.
- **Alternatives, cheapest first:**
  - L0 with `groups` — sections the templates, but the page still lists them
    all.
  - L0 with `templateFilter` — the answer we want, unavailable in 1.54.9 and
    present on Backstage `main`.
  - L1 — the stock page and its stock nav item, which serves browsing the
    product rather than the person who opened a page about execution
    environments.
  - L2 — one nested component is not the unit; the Create tab is a whole
    section.
  - L3 — contribute a group into the stock templates sub-page, which is the
    correction proposed above.
- **Custom surfaces:** the EE page shell and its tabs; the Create tab's template
  list.
- **Revalidated per release:** both, plus the `spec.type` predicate when
  scaffolder changes how templates are selected.
- **Gap:** a missing input — `templateFilter`, already on Backstage `main`. The
  same input removes the second list, which is why the upstream issue is worth
  filing even though the release is close.
- **Author:** the plugin that owns the page — `portal-scaffolder` in this
  repository.
- **Reversal cost:** medium. The page has a route and a nav item, so removing it
  leaves bookmarks that 404.

### 4.5 The review test

A reviewer needs three answers, and the record supplies them in this order:

- What is the cheapest rung this change could have stopped at, and why did it
  not?
- Which surface does this team now own that it did not own before?
- If this ships and the product moves, what does it cost to take back out?

A record that cannot answer those three is not ready to merge, and the answer is
more analysis rather than more code.

## Appendix A — Create execution environment

The case the tree was written against. Three software templates create an
execution environment, differing in what the person supplies. UX wanted one
continuous flow; engineering proposed the stock Software Templates page with a
filter. Both were describing the same answer and neither could show it, because
the argument was about a page and the decision was about a seam.

### A.1 Gate 0 — the journey, and where it starts

Decomposed: browse the execution environments you have, open Create, choose one
of three templates, fill its form, run it, watch the task.

Choose and run are Software Templates, the form is a scaffold template form, and
progress is the stock task sub-page. Every step has an owner (section 2.4), so
nothing here is a new product decision.

The entry point is the interesting part. Today it is a **tab**, not a sidebar
entry and not a header action: `portal-scaffolder` declares a page (`page:ee`,
`noHeader: true`) whose body is `EETabs`, with a Catalog tab and a Create tab,
built from `@backstage/core-components` `Header` and `HeaderTabs`.

- `Code:`
  `workspaces/content-development/plugins/portal-scaffolder/src/alpha.tsx` for
  the page; `components/ExecutionEnvironments/TabviewPage.tsx` for the tabs.
- `In RHDH:` a page called "Execution Environments" with two tabs under it.

So the seam UX was describing is the boundary between those two tabs. Everything
before it is a catalog list of the environments you have; everything after it is
a scaffolder template list. The person is reading one list and then another, and
what carries them across is a tab label. Recorded this way, "the flow feels
wrong" becomes something a reviewer can act on.

### A.2 Gate 1 — how far the stock surface goes

**L0.** The templates sub-page can be reconfigured, but in the release RHDH 2.1
pins (Backstage 1.54.9) the only inputs are `groups` and `enableBackstageUi`.

- `Code:` `groups: [{ title, filter }]` on `sub-page:scaffolder/templates`, with
  each predicate written as `createZodV4FilterPredicateSchema()` from
  `@backstage/filter-predicates`.
- Not adequate: grouping files templates into named sections and puts the rest
  under "Other". It removes nothing, so the page still lists every template in
  the catalogue. What would remove them is a page-wide `templateFilter` input,
  which exists on Backstage `main` and not in 1.54.9 — so at 2.1 it is not
  available to us at all.

**L1.** The whole stock page with its stock nav item. This is engineering's
proposal, and it is the cheapest complete answer. Not adequate: it answers the
person who is browsing the product rather than the person who was already
looking at their execution environments and pressed a button there.

**L2.** One nested component is not the unit here: the Create tab is a whole
section, not a replacement card.

**L3.** Contribute the Create tab's content into the stock templates sub-page
rather than rebuilding it.

- `Code:` `groups: [{ title: 'Execution environments', filter }]` on
  `sub-page:scaffolder/templates`, which files the three templates into their
  own section of the stock page.
- What exists instead: `create/CreateContent.tsx` renders its own catalog-style
  list — `EntityListProvider`, `CatalogFilterLayout`, `EntityTypeFilter`,
  `TagFilterPicker`, `TemplateGroups` and `WizardCard` — filtered on `spec.type`
  containing `execution-environment`. That is a second template list, with its
  own filters and its own card, kept in step with the scaffolder by hand.

**Where that leaves the tree.** Grouping does not filter, so on 2.1 the stock
page cannot show only execution-environment templates. The Create tab's list
can, because it is ours — and that is the whole cost. The tab is L5 surface (a
bespoke list) inside an L4 page (a route and a nav item of ours), reproducing a
sub-page the product already ships.

**The cheap correction, stated honestly.** Delete the Create tab, keep the EE
page as the browse surface, and let its Create entry point open the stock
templates page with a group. The person lands on a page that also lists other
templates: that is the trade, and it is smaller than maintaining a second list.
When `templateFilter` reaches the release, the group becomes a filter and the
trade disappears.

### A.3 What the current implementation costs

- **Two definitions of "an execution environment template".** `CreateContent`
  filters on `spec.type` containing `execution-environment`; the stock sub-page
  would filter on the same field through a predicate. They drift independently.
- **A second template list.** Filters, empty state, grouping and the card are
  ours, so every scaffolder release is a review of whether they still match.
- **A page whose body is not a page.** `noHeader: true` plus `Header` and
  `HeaderTabs` from `@backstage/core-components` means we draw the shell
  ourselves, in MUI, inside a new-frontend-system page. That is the surface the
  drift check exists to freeze, and it is the largest one attached to this
  journey.

## Appendix B — APME quality workflow

The other end of the range. Where Appendix A stops at L3 with nothing of ours to
carry, this one carries a region of bespoke UI — and the interesting part is
that most of its surface was never justified by a missing shape.

### B.1 The journey, and the shape that is genuinely absent

APME scans a repository, pauses for a choice, reviews findings and proposed
fixes, then commits. The steps are choose a project, start a check, review
findings, review per-file proposals, approve, publish.

Choosing a project is Catalog. Starting a check is a scaffolder form, and
progress is a task. The review workbench — findings, per-node proposals, diffs,
approval gates — has no native surface. Nothing in RHDH performs that shape, and
it is the kind section 2.4 names as the exception: a review workbench with
side-by-side diffs.

The exception is granted, and it is granted for that region.

### B.2 What the exception does not buy

The tab it sits in, the page hosting the tab, the lists beside it, the settings,
the repository field in a template. Those are native shapes. In the Portal
plugin they were largely built as bespoke surfaces anyway: 40 files importing
`@material-ui`, 11 on `@backstage/core-components`, eight on PatternFly and none
on `@backstage/ui`, with several rendering through the `compatWrapper` bridge
that mounts an old-style component inside a new-frontend-system extension. That
is migration debt rather than a missing shape, and the two are easy to confuse
when a plugin is written quickly.

### B.3 The constraint that shaped the kit

One visual package serves two hosts: the native APME single-page app and the
Portal, shipped once as `@apme/ui-workflow`. Sharing a visual package across
both meant PatternFly, which is what the native app already used. That is
defensible inside one codebase and wrong for this host, because it makes RHDH
adopt a second kit in order to consume someone else's reuse.

The bill is visible in the code. A hook reads the theme from `@material-ui/core`
and toggles a PatternFly class on `document.documentElement`, with refcounting,
so that PatternFly tokens follow Backstage dark mode. It exists only because two
kits meet, and it stops working the day RHDH stops providing a MUI theme.

### B.4 A missing slot, worked around locally

The Portal needed one control beside "View pull request". The shared component
exposed no input for it, so the Portal forked the panel — 231 lines — and
located the control by querying the rendered markup for a pull-request link,
falling back to matching button text. The comment in the code says to replace
the query once the upstream input exists.

That is section 2.3's missing slot, and the workaround is what such a workaround
costs: it reads the DOM of a component it does not own, and it breaks when that
markup changes. The upstream ask was cheap by comparison.

### B.5 Where it is now

The exception is being narrowed rather than defended. The package exposes a
`headless` entry — controller, transport, state — with no presentation and no
CSS, which is the seam that makes a presentation swap possible at all. A newer
plugin in the APME repository uses it that way: headless for behaviour,
`@backstage/ui` for chrome, PatternFly confined to the workflow body, and its
views exposed as separate entry points (`./workflow`, `./findings`,
`./activity`, `./dependencies`).

The plugin in this repository has not got there yet. It imports `OperationPanel`
from the package root, so it renders the PatternFly panel, and it forks that
panel to place its own host action beside the pull-request control.

What remains on PatternFly is chrome — cards, buttons, alerts, labels, form
controls — rather than the parts that are genuinely custom. The diff view and
the dependency graph are already kit-independent.

### B.6 What the levels look like when they diverge

- **Journey:** L3. One tab inside an entity page, and one action beside it.
- **Surface:** L5. Bespoke components for the workbench region, and for a time
  the surrounding plugin as well.
- **Packaging:** L6. Its own repository, its own release, consumed as a tarball.

One rung cannot say this. It is why the record carries `level` and
`custom_surfaces` separately, and it is why the tree is applied per region: a
change can contribute into someone else's page and still carry a bespoke region
inside it.

## Appendix C — What is on the shelf, as of RHDH 2.1

Reference rather than argument. Everything here is versioned: RHDH 2.1 pins
`@backstage/ui` 0.17.1, and the component list below was read from that
published package, not from `main`. Regenerate it when the pin moves; a list
like this is only worth having while it is true.

One honest note before the tables: RHDH 2.1 imports `@backstage/ui` in a single
file, so most of these components do not yet appear in the product's own pages.
The middle column says what a component is for, not where you can see it today.

### C.1 Primitives

| Component            | Use it for                                               | You change it with       | Carrying cost |
| -------------------- | -------------------------------------------------------- | ------------------------ | ------------- |
| `Accordion`          | progressive disclosure of related sections               | props, theme values      | low           |
| `Alert`              | inline status message: info, success, warning, danger    | props                    | none          |
| `Avatar`             | a person or entity image, with initials as fallback      | props                    | none          |
| `Badge`              | a small count or status marker                           | props                    | none          |
| `Box`                | an unstyled container for spacing, background, border    | props                    | none          |
| `Button`             | the primary action on a surface                          | props                    | none          |
| `ButtonIcon`         | an icon-only action                                      | props                    | none          |
| `ButtonLink`         | a link styled as a button                                | props                    | none          |
| `Card`               | a grouped block of content with a title and footer slots | props                    | none          |
| `Checkbox`           | one independent yes/no choice                            | props                    | none          |
| `CheckboxGroup`      | several independent choices, labelled as a set           | props                    | none          |
| `Combobox`           | a text input with a filtered suggestion list             | props                    | none          |
| `Container`          | a max-width wrapper for page content                     | props                    | none          |
| `DatePicker`         | a single date                                            | props, theme values      | low           |
| `DateRangePicker`    | a start and end date                                     | props, theme values      | low           |
| `Dialog`             | a modal for confirmation or detail                       | props, theme values      | low           |
| `FieldLabel`         | the label above a form field                             | props                    | none          |
| `Flex`               | one-dimensional layout: row or column, gap, alignment    | props                    | none          |
| `FullPage`           | a full-height page shell                                 | props                    | none          |
| `Grid`               | two-dimensional layout                                   | props                    | none          |
| `Header`             | a page header with title, description and actions        | props, theme values      | low           |
| `Link`               | a text link                                              | props                    | none          |
| `List`               | a bulleted or numbered list                              | props                    | none          |
| `Menu`               | a dropdown of actions                                    | props                    | none          |
| `NumberField`        | a numeric input                                          | props                    | none          |
| `PasswordField`      | a masked input                                           | props                    | none          |
| `PluginHeader`       | a page header that carries plugin context                | props, theme values      | low           |
| `Popover`            | anchored content that floats over the page               | props                    | none          |
| `RadioGroup`         | one choice from a small set                              | props                    | none          |
| `SearchAutocomplete` | a search input with suggestions                          | props                    | none          |
| `SearchField`        | a search input                                           | props                    | none          |
| `Select`             | one choice from a known list                             | props                    | none          |
| `Skeleton`           | a placeholder while content loads                        | props                    | none          |
| `Slider`             | a number chosen by dragging                              | props                    | none          |
| `Switch`             | an immediate on/off toggle                               | props                    | none          |
| `Table`              | tabular data, with sorting and row selection             | props, theme values, CSS | medium        |
| `TablePagination`    | paging controls under a table                            | props                    | none          |
| `Tabs`               | switching between sibling views                          | props, theme values      | low           |
| `TagGroup`           | a set of tags, optionally removable                      | props                    | none          |
| `Text`               | body and heading text with variants                      | props                    | none          |
| `TextAreaField`      | a multi-line text input                                  | props                    | none          |
| `TextField`          | a single-line text input                                 | props                    | none          |
| `ToggleButton`       | a button with a pressed state                            | props                    | none          |
| `ToggleButtonGroup`  | a segmented control                                      | props                    | none          |
| `Tooltip`            | a short hint on hover or focus                           | props                    | none          |
| `VisuallyHidden`     | content for assistive technology only                    | nothing to change        | none          |

**Cost is a property of how you change a component, not of which one you pick.**
Every row above can be changed three ways, and they cost different amounts:

| Way                | What it means                                                           | Carrying cost |
| ------------------ | ----------------------------------------------------------------------- | ------------- |
| props              | you pass what the component already accepts                             | none          |
| theme values       | colour, spacing and type from the theme, applied to every instance      | low           |
| `className` or CSS | you own the look from that point on: it is custom surface and it drifts | medium        |
| your own component | you replace it rather than change it                                    | high          |

The step from theme values to CSS is the one that matters. Above it, the
component is still upstream's and the drift check leaves you alone. Below it,
you are revalidating a look on every release, and no check will remind you.

### C.2 RHDH constructs

What you attach to, rather than what you draw with. These are the surfaces from
section 1.C, and the cheapest way to change each.

| Construct                 | You change it by                                                         | Carrying cost |
| ------------------------- | ------------------------------------------------------------------------ | ------------- |
| App shell and sidebar     | `NavContentBlueprint`, or the page's own title and icon                  | low           |
| Page                      | `withOverrides` on the owning plugin: title, icon, path                  | none          |
| Sub-page                  | its configuration inputs, for example `groups` on the templates sub-page | none          |
| Entity tab                | `EntityDetailTabBlueprint`                                               | low           |
| Entity card               | `EntityCardBlueprint`                                                    | low           |
| Home widget               | `HomePageWidgetBlueprint`                                                | low           |
| Catalog column            | `CatalogTableColumnBlueprint`                                            | low           |
| Header or context action  | `PluginHeaderActionBlueprint`, `EntityContextMenuItemBlueprint`          | low           |
| Form field                | `FormFieldBlueprint`                                                     | low           |
| One nested component      | `SwappableComponentBlueprint`, where the owner offers one                | low           |
| Theme and language        | `ThemeBlueprint`, `IconBundleBlueprint`, `TranslationBlueprint`          | low           |
| A new page of stock parts | `PageBlueprint` composed from the primitives above                       | medium        |
| A copy of a stock page    | forking it into our own plugin                                           | high          |

Two naming worlds meet in this table, and one does not imply the other. The
Portal's own extension API (`@ansible/portal-extension-api/alpha`) provides
`EntityDetailTabBlueprint`, `EntityOverviewCardBlueprint`,
`CatalogTableColumnBlueprint` and the scaffolder blueprints. Upstream Backstage
provides `EntityContentBlueprint` for the same job as an entity tab, and has no
catalog-column blueprint at all — upstream customises columns by replacing the
`page:catalog` extension. Use the Portal name when contributing to the Portal
and the upstream name when contributing upstream.

Two of these deserve a second look. **Swap before fork**:
`SwappableComponentBlueprint` exists so a host can replace one nested component
without owning the page, and it is the only replacement the owning plugin
promises to keep working. **A new page of stock parts** is not expensive because
of the components; it is expensive because of the route, the nav item and the
tests that come with it.

### C.3 Regenerating this appendix

- The primitive list comes from the published package: RHDH's pin in
  `packages/app/package.json`, then `@backstage/ui`'s published contents.
- The construct list comes from the alpha extensions in `backstage/backstage`
  and `redhat-developer/rhdh`, plus the extension points this repository already
  consumes.
- Both lists are checked in the same way as the drift baseline: regenerate,
  diff, commit. If the diff is large, that is the release note.

### C.4 Pages and sub-pages, by example

Examples, not an inventory. These are the ones a contributor meets first; the
full set is larger and changes between releases.

| Page               | Route                | Note                                                                      |
| ------------------ | -------------------- | ------------------------------------------------------------------------- |
| Catalog            | `/catalog`           | stock, present in every deployment                                        |
| Software Templates | `/create`            | stock, retitled "Self-service" by RHDH                                    |
| Search             | `/search`            | stock                                                                     |
| Settings           | `/settings`          | stock, with General, Authentication Providers and Feature Flags sub-pages |
| Docs               | `/docs`              | stock                                                                     |
| Notifications      | `/notifications`     | stock                                                                     |
| Home               | `/home`              | replaced in RHDH by the dynamic home page                                 |
| X2Ansible          | `/x2a`               | ours, in `rhdh-plugins`                                                   |
| Orchestrator       | `/orchestrator`      | ours, in `rhdh-plugins`                                                   |
| Bulk import        | `/bulk-import`       | ours, in `rhdh-plugins`                                                   |
| Adoption Insights  | `/adoption-insights` | ours, in `rhdh-plugins`                                                   |
| Extensions         | `/extensions`        | ours, in `rhdh-plugins`                                                   |

Sub-pages worth knowing: Software Templates has `templates`, `tasks`, `actions`,
`edit` and `templating-extensions`; Settings has `general`, `auth-providers` and
`feature-flags`. Every one of those is a place your content might belong, and
the choice between them is the journey question in section 2.4.

**Going deeper.** Four steps, in the order that answers a real question:

1. **What does a given host actually have?** Two sources, and configuration
   alone under-reports. Read the `app.extensions` and dynamic-plugin entries,
   then read the statically registered features in
   `createApp({ features: [...] })` — RHDH mounts Catalog and Search that way
   without listing them in configuration. Together they are the list that
   matters for a deployment.
2. **What does a package offer?** Search its source for `PageBlueprint.make(`,
   `PageBlueprint.makeWithOverrides(`, `SubPageBlueprint.make(` and
   `SubPageBlueprint.makeWithOverrides(`. The last of these is easy to miss and
   is how RHDH re-declares the Scaffolder page. The extension id defaults to
   `page:<pluginId>` and `sub-page:<pluginId>/<name>`; `path` is the route and
   `title` is the nav label.
3. **What is RHDH's own?** The `redhat-developer/rhdh-plugins` workspaces. As of
   2.1 they add pages and no sub-pages, so sub-pages are effectively an upstream
   construct.
4. **What about tabs?** Entity page tabs are a separate list: search for
   `EntityContentBlueprint` and `EntityDetailTabBlueprint`. They are not pages
   and do not appear in any route list.

Two cautions. Search results are a floor, not a total: pages are occasionally
declared indirectly, and a code search is capped. And a page existing in a
package is not the same as it being enabled in a deployment, which is why step 1
comes first.

## References

- Backstage frontend system architecture:
  <https://backstage.io/docs/frontend-system/architecture/app>
- Backstage extension blueprints:
  <https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints>
- RHDH frontend plugin wiring (legacy reference):
  `docs/dynamic-plugins/frontend-plugin-wiring.md` in `redhat-developer/rhdh`
- RHDH configuration migration to NFS:
  `docs/dynamic-plugins/migrating-config-to-new-frontend-system.md` in
  `redhat-developer/rhdh`
- RHDH plugin migration to NFS:
  `docs/dynamic-plugins/migrating-plugins-to-new-frontend-system.md` in
  `redhat-developer/rhdh`
- The advisory BUI drift check: `bui-baseline.yaml` and
  `scripts/check-bui-drift.mjs` in this repository
