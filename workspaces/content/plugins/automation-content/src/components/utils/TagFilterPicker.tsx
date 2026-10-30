import { Box, Select, Text } from '@backstage/ui';

interface TagFilterPickerProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (selectedValues: string[]) => void;
  placeholder?: string;
  noOptionsText?: string;
}

/** Prototype multi-select tag picker, using the BUI searchable select equivalent. */
export function TagFilterPicker({
  label,
  options,
  value,
  onChange,
  placeholder,
  noOptionsText = 'No options available',
}: TagFilterPickerProps) {
  return (
    <Box py="1">
      <Select
        label={label}
        selectionMode="multiple"
        options={options.map(id => ({ id, label: id }))}
        value={value}
        onChange={keys => onChange(keys.map(String))}
        search={{ placeholder: placeholder || label }}
      />
      {!options.length && <Text>{noOptionsText}</Text>}
    </Box>
  );
}
