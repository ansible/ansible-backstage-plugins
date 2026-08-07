/*
 * Copyright Red Hat
 */

import { Button, ButtonProps } from '@material-ui/core';
import CodeIcon from '@material-ui/icons/Code';

export interface EditInDevSpacesButtonProps {
  url: string | null | undefined;
  label?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
}

/** Opens the repo (optional branch) in OpenShift Dev Spaces when configured. */
export const EditInDevSpacesButton = ({
  url,
  label = 'Open in Dev Spaces',
  size = 'small',
  variant = 'outlined',
  color = 'primary',
}: EditInDevSpacesButtonProps) => {
  if (!url) {
    return null;
  }
  return (
    <Button
      size={size}
      variant={variant}
      color={color}
      startIcon={<CodeIcon style={{ fontSize: 14 }} />}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </Button>
  );
};
