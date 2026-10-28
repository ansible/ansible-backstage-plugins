import { Badge, Box, Flex, Text } from '@backstage/ui';
import type { OptionSpec } from '../../api';

/** Recursive argument documentation; nested fields stay keyboard-discoverable. */
export function OptionTree({ name, spec }: { name: string; spec: OptionSpec }) {
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
        {spec.choices && (
          <Text>Choices: {spec.choices.map(String).join(' | ')}</Text>
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
        {spec.suboptions && (
          <details open>
            <summary>Suboptions for {name}</summary>
            {Object.entries(spec.suboptions).map(([child, childSpec]) => (
              <OptionTree key={child} name={child} spec={childSpec} />
            ))}
          </details>
        )}
      </Flex>
    </Box>
  );
}
