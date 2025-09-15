import { useState } from 'react';
import Button from '@material-ui/core/Button';
import Checkbox from '@material-ui/core/Checkbox';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Dialog from '@material-ui/core/Dialog';
import FormControlLabel from '@material-ui/core/FormControlLabel';

const options = [
  {
    label: 'Organizations, Users, and Teams',
    value: 'orgsUsersTeams',
  },
  {
    label: 'Job Templates',
    value: 'templates',
  },
];

export interface SyncConfirmationDialogProps {
  id: string;
  keepMounted: boolean;
  value: string[];
  open: boolean;
  onClose: (value?: string[]) => void;
}

export const SyncConfirmationDialog = (props: SyncConfirmationDialogProps) => {
  const { onClose, value: valueProp, open, ...other } = props;
  const [value, setValue] = useState<string[]>(valueProp);

  const handleCancel = () => {
    onClose();
  };

  const handleOk = () => {
    onClose(value);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setValue(checked ? [...value, name] : value.filter(v => v !== name));
  };

  return (
    <Dialog
      maxWidth="xs"
      aria-labelledby="confirmation-dialog-title"
      open={open}
      {...other}
    >
      <DialogTitle id="confirmation-dialog-title">
        AAP synchronization options
      </DialogTitle>
      <DialogContent dividers>
        {options.map(option => (
          <FormControlLabel
            key={option.value}
            control={
              <Checkbox
                checked={value.includes(option.value)}
                onChange={handleChange}
                name={option.value}
                value={option.value}
              />
            }
            label={option.label}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="primary">
          Cancel
        </Button>
        <Button onClick={handleOk} color="primary">
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
};
