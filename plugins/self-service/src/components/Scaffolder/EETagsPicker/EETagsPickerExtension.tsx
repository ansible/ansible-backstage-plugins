import { useState, useEffect, useMemo } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { TextField, Typography, Box, IconButton } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import DeleteIcon from '@material-ui/icons/Delete';

const useStyles = makeStyles(theme => ({
  container: {
    width: '100%',
  },
  mainContainer: {
    border: `1px solid ${theme.palette.grey[500]}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
  },
  titleSection: {
    borderBottom: `1px solid ${theme.palette.grey[800]}`,
  },
  tagsContainer: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  tagRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1.5),
    '&:last-child': {
      marginBottom: 0,
    },
  },
  tagInputContainer: {
    flex: 1,
    border: `1px solid ${theme.palette.grey[600]}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    backgroundColor: theme.palette.background.paper,
  },
  tagInput: {
    width: '100%',
  },
  actionsBox: {
    display: 'flex',
    flexDirection: 'row',
    gap: theme.spacing(0.5),
    alignItems: 'center',
    flexShrink: 0,
  },
  errorBox: {
    marginTop: theme.spacing(1),
  },
  bottomActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  },
  helpText: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  addButton: {
    marginLeft: 'auto',
  },
  descriptionText: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: '0.8rem',
  },
  minusButton: {
    color: theme.palette.primary.main,
    '& .MuiTypography-root': {
      fontSize: '1.25rem',
      fontWeight: 'bold',
      lineHeight: 1,
    },
  },
}));

// Tag validation function - validates according to Backstage rules
// Tags must be sequences of [a-z0-9+#] separated by [-], at most 63 characters

const isValidTag = (tag: string): { valid: boolean; error?: string } => {
  if (!tag || tag.trim().length === 0) {
    return { valid: false, error: 'Tag is required' };
  }

  const trimmedTag = tag.trim();

  if (trimmedTag.length < 1) {
    return { valid: false, error: 'Tag must be at least 1 character long' };
  }

  if (trimmedTag.length > 63) {
    return { valid: false, error: 'Tag must be at most 63 characters long' };
  }

  if (trimmedTag.startsWith('-')) {
    return {
      valid: false,
      error: 'Tag cannot start with a hyphen',
    };
  }

  if (trimmedTag.endsWith('-')) {
    return {
      valid: false,
      error: 'Tag cannot end with a hyphen',
    };
  }

  if (/-{2,}/.test(trimmedTag)) {
    return {
      valid: false,
      error: 'Tag cannot contain consecutive hyphens',
    };
  }

  // Default: lowercase letters, numbers, plus signs, hash signs [a-z0-9+#] separated by hyphens
  const validPattern = /^(?=.{1,63}$)[a-z0-9+#]+(?:-[a-z0-9+#]+)*$/;
  if (!validPattern.test(trimmedTag)) {
    return {
      valid: false,
      error:
        'Tag must consist of lowercase letters, numbers, plus signs, and hash signs [a-z0-9+#] separated by hyphens',
    };
  }
  return { valid: true };
};

export const EETagsPickerExtension = ({
  onChange,
  required,
  disabled,
  rawErrors = [],
  schema,
  formData,
}: FieldExtensionComponentProps<string[]>) => {
  const classes = useStyles();
  const requiredField = required ? required : true;
  const defaultTags = useMemo(
    () => (schema?.default as string[]) || [],
    [schema?.default],
  );
  const customTitle = schema?.title;
  const customDescription = schema?.description;
  const tags = formData ?? [];
  const [tagErrors, setTagErrors] = useState<Record<number, string>>({});

  const validateTag = (tag: string, index: number): boolean => {
    const validation = isValidTag(tag);
    if (!validation.valid) {
      setTagErrors(prev => ({ ...prev, [index]: validation.error || '' }));
      return false;
    }
    setTagErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[index];
      return newErrors;
    });
    return true;
  };

  useEffect(() => {
    if (formData === undefined && defaultTags.length > 0) {
      onChange(defaultTags);
    }
  }, [formData, defaultTags, onChange]);

  const handleTagChange = (index: number, value: string) => {
    if (value.length === 0) {
      setTagErrors(prev => ({ ...prev, [index]: '' }));
    } else {
      validateTag(value, index);
    }
    const updatedTags = [...tags];
    updatedTags[index] = value;
    onChange(updatedTags);
  };

  const handleAddTag = () => {
    const newTags = [...tags, ''];
    onChange(newTags);
  };

  const handleRemoveTag = (index: number) => {
    const updatedTags = tags.filter((_, i) => i !== index);
    onChange(updatedTags);
    setTagErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[index];
      const reindexed: Record<number, string> = {};
      Object.keys(newErrors).forEach(key => {
        const oldIndex = parseInt(key, 10);
        if (oldIndex > index) {
          reindexed[oldIndex - 1] = newErrors[oldIndex];
        } else if (oldIndex < index) {
          reindexed[oldIndex] = newErrors[oldIndex];
        }
      });
      return reindexed;
    });
  };

  const handleMoveUp = (index: number) => {
    const updatedTags = [...tags];
    [updatedTags[index - 1], updatedTags[index]] = [
      updatedTags[index],
      updatedTags[index - 1],
    ];
    onChange(updatedTags);
    setTagErrors(prev => {
      const updatedErrors: Record<number, string> = {};
      Object.keys(prev).forEach(key => {
        const idx = parseInt(key, 10);
        if (idx === index) {
          updatedErrors[index - 1] = prev[index];
        } else if (idx === index - 1) {
          updatedErrors[index] = prev[index - 1];
        } else {
          updatedErrors[idx] = prev[idx];
        }
      });
      return updatedErrors;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === tags.length - 1) return;
    const updatedTags = [...tags];
    [updatedTags[index], updatedTags[index + 1]] = [
      updatedTags[index + 1],
      updatedTags[index],
    ];
    onChange(updatedTags);
    setTagErrors(prev => {
      const updatedErrors: Record<number, string> = {};
      Object.keys(prev).forEach(key => {
        const idx = parseInt(key, 10);
        if (idx === index) {
          updatedErrors[index + 1] = prev[index];
        } else if (idx === index + 1) {
          updatedErrors[index] = prev[index + 1];
        } else {
          updatedErrors[idx] = prev[idx];
        }
      });
      return updatedErrors;
    });
  };

  const handleBlur = (index: number) => {
    let tag = tags[index];
    tag = tag.trim();
    if (tag && tag.trim().length > 0) {
      validateTag(tag, index);
      const trimmedTags = tags;
      if (trimmedTags.length === 0 && required) {
        onChange(defaultTags);
      } else {
        onChange(trimmedTags);
      }
    }
  };

  return (
    <Box className={classes.container}>
      <Box className={classes.mainContainer}>
        <Box>
          {customTitle && (
            <Typography
              variant="h6"
              gutterBottom
              className={classes.titleSection}
            >
              {customTitle}
            </Typography>
          )}
          {customDescription && (
            <Typography variant="body2" className={classes.descriptionText}>
              {customDescription}
            </Typography>
          )}
        </Box>

        <Box className={classes.tagsContainer}>
          {tags.map((tag, index) => (
            <Box key={index} className={classes.tagRow}>
              <Box className={classes.tagInputContainer}>
                <TextField
                  label={`tags-${index}`}
                  value={tag}
                  onChange={e => handleTagChange(index, e.target.value)}
                  onBlur={() => handleBlur(index)}
                  required={requiredField}
                  disabled={disabled}
                  error={!!tagErrors[index] || rawErrors.length > 0}
                  fullWidth
                  variant="standard"
                  className={classes.tagInput}
                  size="small"
                />
                {tagErrors[index] && (
                  <Alert
                    severity="error"
                    className={classes.errorBox}
                    style={{ marginTop: 8, marginBottom: 0 }}
                  >
                    {tagErrors[index]}
                  </Alert>
                )}
              </Box>
              <Box className={classes.actionsBox}>
                {tags && tags.length > 1 && (
                  <>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveUp(index)}
                      disabled={disabled || index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveDown(index)}
                      disabled={disabled || index === tags.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
                <IconButton
                  onClick={() => handleRemoveTag(index)}
                  disabled={disabled || (required && tags.length === 1)}
                  aria-label="Remove tag"
                  className={classes.minusButton}
                  color="primary"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>

        {rawErrors.length > 0 && (
          <Alert severity="error" className={classes.errorBox}>
            {rawErrors[0]}
          </Alert>
        )}

        <Box className={classes.bottomActions}>
          <IconButton
            onClick={handleAddTag}
            disabled={disabled}
            className={classes.addButton}
            color="primary"
            aria-label="Add tag"
          >
            <AddIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};
