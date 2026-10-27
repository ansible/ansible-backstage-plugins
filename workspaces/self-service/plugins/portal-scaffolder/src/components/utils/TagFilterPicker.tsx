import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

interface TagFilterPickerProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (selectedValues: string[]) => void;
  placeholder?: string;
  noOptionsText?: string;
}

export const TagFilterPicker = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  noOptionsText = 'No options available',
}: TagFilterPickerProps) => {
  const handleChange = (_event: any, newValue: string[]) => {
    onChange(newValue);
  };

  return (
    <Box pb={1} pt={1}>
      <Typography
        variant="subtitle2"
        component="label"
        sx={{ fontWeight: 500 }}
      >
        {label}
      </Typography>
      <Autocomplete
        multiple
        options={options}
        disableCloseOnSelect
        value={value}
        onChange={handleChange}
        getOptionLabel={option => option}
        renderOption={(props, option, { selected }) => (
          <li {...props}>
            <Checkbox
              icon={icon}
              checkedIcon={checkedIcon}
              checked={selected}
              sx={{ mr: 1 }}
            />
            {option}
          </li>
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
