import { useState } from 'react';
import { Box, Checkbox, TextField, Typography } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';
import CheckBoxIcon from '@material-ui/icons/CheckBox';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

interface TagFilterPickerProps {
  label: string;
  options: string[];
  onChange: (selectedValues: string[]) => void;
  placeholder?: string;
  noOptionsText?: string;
}

export const TagFilterPicker = ({
  label,
  options,
  onChange,
  placeholder,
  noOptionsText = 'No options available',
}: TagFilterPickerProps) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const handleChange = (_event: any, newValue: string[]) => {
    setSelectedValues(newValue);
    onChange(newValue);
  };

  return (
    <Box pb={1} pt={1}>
      <Typography
        variant="subtitle2"
        component="label"
        style={{ fontWeight: 500 }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        options={options}
        disableCloseOnSelect
        value={selectedValues}
        onChange={handleChange}
        getOptionLabel={option => option}
        renderOption={(option, { selected }) => (
          <>
            <Checkbox
              icon={icon}
              checkedIcon={checkedIcon}
              checked={selected}
              style={{ marginRight: 8 }}
            />
            {option}
          </>
        )}
        size="small"
        renderInput={params => (
          <TextField
            {...params}
            variant="outlined"
            placeholder={placeholder || label}
          />
        )}
        noOptionsText={noOptionsText}
      />
    </Box>
  );
};
