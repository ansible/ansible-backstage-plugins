import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { formatRelativeTime } from '../../utils';

export interface SyncNowDialogOption {
  value: string;
  label: string;
  lastSyncTime: string | null;
}

export interface SyncNowDialogProps {
  open: boolean;
  options: readonly SyncNowDialogOption[];
  onCancel: () => void;
  onConfirm: (selectedOptions: string[]) => void;
}

/** MUI v5 dialog for choosing which data sources to synchronize. */
export function SyncNowDialog({
  open,
  options,
  onCancel,
  onConfirm,
}: Readonly<SyncNowDialogProps>) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelectedOptions([]);
  }, [open]);

  const handleChange = (value: string, checked: boolean) => {
    setSelectedOptions(current => {
      if (checked) {
        return current.includes(value) ? current : [...current, value];
      }
      return current.filter(option => option !== value);
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="md"
      aria-labelledby="sync-now-dialog-title"
    >
      <DialogTitle id="sync-now-dialog-title">
        AAP synchronization options
      </DialogTitle>
      <DialogContent dividers>
        {options.map(option => (
          <FormControlLabel
            key={option.value}
            sx={{ display: 'flex', mb: 1, ml: 0, mr: 0 }}
            control={
              <Checkbox
                checked={selectedOptions.includes(option.value)}
                onChange={event =>
                  handleChange(option.value, event.target.checked)
                }
                name={option.value}
                value={option.value}
              />
            }
            label={
              <span
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span style={{ whiteSpace: 'nowrap' }}>{option.label}</span>
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}
                >
                  {formatRelativeTime(option.lastSyncTime)}
                </Typography>
              </span>
            }
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm(selectedOptions)}>Ok</Button>
      </DialogActions>
    </Dialog>
  );
}
