import { Badge, Box, Flex, Text } from '@backstage/ui';
import type { OptionSpec } from '../../api';

/**
 * Real ansible modules nest options two or three levels deep; anything past
 * this cap is pathological manifest data (or a self-referential loop), which
 * would otherwise recurse the renderer until the tab dies.
 */
const MAX_OPTION_DEPTH = 20;

/** Recursive argument documentation; nested fields stay keyboard-discoverable. */
export function OptionTree({
  name,
  spec,
  depth = 1,
}: {
  name: string;
  spec: OptionSpec;
  depth?: number;
}) {
  return (
    <Box pl="3" mb="3">
      <Flex direction="column" gap="2">
        <Flex gap="2">
          <Text weight="bold">{name}</Text>
          <Text>
            {spec.type}
            {spec.elements ? `[${spec.elements}]` : ''}
          </Text>
          {spec.required && <Badge>required</Badge>}
        </Flex>
        {spec.choices !== undefined && spec.choices !== null && (
          <Text>
            Choices:{' '}
            {(Array.isArray(spec.choices) ? spec.choices : [spec.choices])
              .map(String)
              .join(' | ')}
          </Text>
        )}
        {spec.default !== undefined && (
          <Text>
            Default:{' '}
            {typeof spec.default === 'object'
              ? JSON.stringify(spec.default)
              : String(spec.default)}
          </Text>
        )}
        {(Array.isArray(spec.description)
          ? spec.description
          : [spec.description]
        )
          .filter(Boolean)
          .map((line, index) => (
            <Text as="p" key={index}>
              {line}
            </Text>
          ))}
        {spec.suboptions && depth < MAX_OPTION_DEPTH && (
          <details open>
            <summary>Suboptions for {name}</summary>
            {Object.entries(spec.suboptions).map(([child, childSpec]) => (
              <OptionTree
                key={child}
                name={child}
                spec={childSpec}
                depth={depth + 1}
              />
            ))}
          </details>
        )}
      </Flex>
    </Box>
  );
}
