# Controller image field and selected image summary

Decision recorded November 17, 2026, for the Use in Controller follow-up.

## Scope and ownership

- **Job to be done** — Choose an indexed execution environment tag, inspect its pull reference and digest, and submit the reference in the existing Controller software template.
- **Business fit** — Implements the selected-image portion of the Use in Controller workflow approved by the EE registry pod and reviewed by Tina Tien.
- **Navigation** — The existing image details and image menu actions enter the existing Templates and Scaffolder flow. The image summary adds content within the field.
- **Workflow continuity** — The existing wizard owns the form steps, review, submission and task page. Changing the tag updates the summary in that form.
- **Experience cost** — One field contribution to maintain and verify against the host. The summary follows Tina's prototype, with muted values requested by Alex.
- **Architecture** — Content Management registers EEImageVersionPicker through createPortalScaffolderFieldBlueprints in src/alpha.tsx. The Portal bridge supplies the native FormFieldBlueprint and existing scaffolder.fields attachment.
- **Level** — L3, a domain field contribution into the existing Scaffolder wizard.

## Alternatives considered, cheapest first

- **L0 configuration** — Template YAML selects the field through ui:field and supplies the ordinary task schema. A static enum cannot load the selected repository's current tags and associate the selected reference with its registry digest. The template's existing image parameter remains the submitted value.
- **L1 stock page** — The existing Templates and Scaffolder pages already host the workflow. Their ordinary string input does not resolve repository tags or display the associated digest, so the field is contributed within those pages.
- **L2 stock sub-page or component swap** — Swapping the wizard or its global field template would affect unrelated template fields. The installed native form-field extension slot can restrict this behavior to the image parameter.
- **L3 field contribution** — Chosen. The installed Portal bridge registers a native FormFieldBlueprint. It loads the existing EE repository API and renders the selected reference using the installed BUI components.

## Rendering and carrying cost

- **Custom surfaces** — One domain field region, EEImageVersionPicker, including the image and digest summary card. Content Management owns its domain data resolution and composition.
- **Custom kind** — Domain. The behavior depends on execution environment repository tags, digests and Controller image references.
- **Justification** — Resolve live EE tags and show the selected image identity within the existing form because the stock string field cannot supply that domain behavior.
- **Gap** — Domain behavior uses an existing field slot and the available BUI primitives.
- **Upstream issue** — None required for this domain field. The decision tree's Appendix A.4 permits domain picker extensions with an explicit justification.
- **Filing stream** — Content Management maintains this contribution through the Portal SDK field contract.
- **Primitives** — Direct imports from the pinned @backstage/ui 0.17.1 package provide Select, Card, CardBody, Flex, Box, Text, TextField, Alert and Button. The summary displays Image and Image digest labels. Alex requested removing its heading after reviewing the preview.
- **Theme** — Standard typography, spacing and secondary text tokens. Inline overflowWrap allows complete pull references and digests to wrap within the field.
- **Revalidation surface** — Native field registration, tagged and digest-pinned input, tag changes updating reference and digest together, direct template launch, loading/error states, long references, host light/dark themes and the submitted image parameter.
- **Reversal cost** — Remove the field registration and its template ui:field reference, then use the ordinary pull-reference text input. Removing only the summary affects the picker body.

## Evidence

- workspaces/content-management/plugins/automation-content/src/alpha.tsx registers EEImageVersionPicker through the Portal field bridge.
- workspaces/portal-core/plugins/portal-extension-api/src/nfs/ScaffolderFieldBlueprint.ts implements that bridge with the native FormFieldBlueprint.
- workspaces/content-management/plugins/automation-content/src/components/ExecutionEnvironments/EEImageVersionPicker.tsx contains the picker and summary.
- EEImageVersionPicker.test.tsx verifies that changing tags updates the digest and that digest-pinned references display the correct digest.
- Tina's portal-rhdh-bui prototype at commit 343f9be shows the Selected execution environment card in the Scaffolder field template.
- The UI decision tree associated with [PR #1077](https://github.com/ansible/ansible-backstage-plugins/pull/1077), especially sections 2.2, 4 and Appendix A.4, governs the field classification. Constitution sections 5.1 and 5.5 govern the surface and primitive choices.

The earlier checkout-local statements of zero custom surfaces are superseded for this field by the explicit domain contribution inventory above.
