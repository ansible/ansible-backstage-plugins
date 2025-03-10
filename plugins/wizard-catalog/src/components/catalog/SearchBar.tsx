import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import React, { useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';

export function SearchBar({
  onSearchChange,
}: {
  onSearchChange: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const [timer, setTimer] = useState<NodeJS.Timeout | undefined>(undefined);

  const waitToCall = (
    callback: (...args: any[]) => void,
    waitingTime: number,
    ...args: any[]
  ) => {
    if (timer) {
      clearTimeout(timer);
      setTimer(undefined);
    }

    // Set a new timer
    const newTimer = setTimeout(() => {
      callback(...args);
      setTimer(undefined);
    }, waitingTime);

    setTimer(newTimer);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onSearchChange(newValue);
  };

  const handleClear = () => {
    setValue('');
    onSearchChange('');
  };

  return (
    <TextField
      variant="outlined"
      placeholder="Search"
      fullWidth
      value={value}
      onChange={e => {
        setValue(e.target.value);
        waitToCall(handleSearch, 300, e);
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '44px',
          border: '1px solid #E4E4E4',
          height: '67px',
          padding: '16px',
          '& input': {
            // color: '#181818',
            fontFamily: 'Red Hat Text',
            fontSize: '18px',
            fontStyle: 'normal',
            fontWeight: 400,
            lineHeight: '26px',
            letterSpacing: '-0.25px',
          },
        },
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Box style={{ padding: '8px' }}>
              <SearchIcon fontSize="medium" sx={{ marginTop: '3px' }} />
            </Box>
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            <Button onClick={handleClear} color="primary" size="medium">
              Clear
            </Button>
          </InputAdornment>
        ),
      }}
    />
  );
}
