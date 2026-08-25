/*
 * Copyright Red Hat
 *
 * Non-AI scan options for Portal Quality tab when portal AI is disabled.
 * Avoids mounting @apme/ui-workflow CheckOptionsForm (which fetches AI models on mount).
 */

import {
  ExpandableSection,
  Flex,
  FlexItem,
  TextInput,
} from '@patternfly/react-core';

export interface ApmeScanOptionsFieldsProps {
  ansibleVersion: string;
  onAnsibleVersionChange: (value: string) => void;
  collections: string;
  onCollectionsChange: (value: string) => void;
  idPrefix?: string;
}

/** Ansible version + collections only — no AI model fetch. */
export function ApmeScanOptionsFields({
  ansibleVersion,
  onAnsibleVersionChange,
  collections,
  onCollectionsChange,
  idPrefix = '',
}: ApmeScanOptionsFieldsProps) {
  const prefix = idPrefix ? `${idPrefix}-` : '';

  return (
    <ExpandableSection toggleText="Advanced Options" style={{ marginTop: 8 }}>
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <FlexItem>
          <label
            htmlFor={`${prefix}ansible-version`}
            style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}
          >
            Ansible Core Version
          </label>
          <TextInput
            id={`${prefix}ansible-version`}
            placeholder="e.g. 2.16"
            value={ansibleVersion}
            onChange={(_e, v) => onAnsibleVersionChange(v)}
          />
        </FlexItem>
        <FlexItem>
          <label
            htmlFor={`${prefix}collections`}
            style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}
          >
            Collections (comma-separated)
          </label>
          <TextInput
            id={`${prefix}collections`}
            placeholder="e.g. ansible.posix, community.general"
            value={collections}
            onChange={(_e, v) => onCollectionsChange(v)}
          />
        </FlexItem>
      </Flex>
    </ExpandableSection>
  );
}
