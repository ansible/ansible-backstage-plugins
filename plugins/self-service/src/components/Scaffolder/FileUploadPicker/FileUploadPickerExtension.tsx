import { ChangeEvent, useState, useEffect, useRef } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Button, Typography, Box, IconButton } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import UploadIcon from '@material-ui/icons/CloudUpload';
import DeleteIcon from '@material-ui/icons/Delete';
import { parseMarkdownLinks } from '../utils/parseMarkdownLinks';

const useStyles = makeStyles(theme => ({
  title: {
    fontSize: '1.2rem',
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  description: {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  uploadButton: {
    width: '100%',
    padding: theme.spacing(1.5),
    textTransform: 'none',
    fontSize: '1rem',
    marginBottom: theme.spacing(2),
  },
  fileContent: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
  },
  fileContentText: {
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  hiddenFileInput: {
    display: 'none',
  },
  fileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
}));

export const FileUploadPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();

  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const isInitialized = useRef(false);

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Upload File';
  const customDescription =
    uiSchema?.['ui:options']?.description || schema?.description;

  const fileInputId = `file-upload-input-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().toString().replaceAll('-', '').substring(2, 11)
      : Date.now().toString(36).substring(2, 11)
  }`;

  const storageKey = `file-upload-filename-${schema?.title || 'default'}`;

  useEffect(() => {
    if (!isInitialized.current && formData === '') {
      onChange(undefined as any);
      isInitialized.current = true;
    } else if (formData && formData !== '') {
      isInitialized.current = true;
    }
  }, [formData, onChange]);

  useEffect(() => {
    if (!formData || formData === '') {
      setUploadedFile(null);
      return;
    }

    if (formData.startsWith('data:text/plain;base64,')) {
      try {
        const base64Content = formData.split(',')[1];
        if (!base64Content) {
          setUploadedFile(null);
          return;
        }
        const content = atob(base64Content);

        let fileName: string;
        try {
          const storedFilename = sessionStorage.getItem(storageKey);
          if (storedFilename) {
            fileName = storedFilename;
          } else {
            fileName = schema?.title
              ? `${schema.title.toLowerCase().replaceAll(/\s+/g, '-')}.txt`
              : 'uploaded-file.txt';
          }
        } catch {
          fileName = schema?.title
            ? `${schema.title.toLowerCase().replaceAll(/\s+/g, '-')}.txt`
            : 'uploaded-file.txt';
        }

        setUploadedFile(prev => {
          if (prev?.content === content && prev?.name === fileName) {
            return prev;
          }
          return { name: fileName, content };
        });
      } catch {
        setUploadedFile(null);
      }
    } else if (formData && !formData.startsWith('data:')) {
      setUploadedFile(null);
    }
  }, [formData, schema?.title, storageKey]);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        setUploadedFile({ name: file.name, content });
        try {
          sessionStorage.setItem(storageKey, file.name);
        } catch {
          // Ignore sessionStorage errors (e.g., in private browsing)
        }
        const dataUrl = `data:text/plain;base64,${btoa(content)}`;
        onChange(dataUrl);
      };
      reader.readAsText(file);
    }
  };

  const triggerFileUpload = () => {
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    fileInput?.click();
  };

  const clearFile = () => {
    setUploadedFile(null);
    onChange(undefined as any);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore sessionStorage errors
    }
  };

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {customDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(customDescription)}
        </Typography>
      )}

      <Button
        variant="outlined"
        startIcon={<UploadIcon />}
        onClick={triggerFileUpload}
        disabled={disabled}
        className={classes.uploadButton}
      >
        Choose File
      </Button>

      <input
        id={fileInputId}
        type="file"
        accept=".yml,.yaml,.txt"
        onChange={handleFileUpload}
        className={classes.hiddenFileInput}
      />

      {uploadedFile && (
        <Box className={classes.fileContent}>
          <Box className={classes.fileHeader}>
            <Typography variant="subtitle2">
              File: {uploadedFile.name}
            </Typography>
            <IconButton
              size="small"
              onClick={clearFile}
              disabled={disabled}
              aria-label="Remove File"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          <Typography className={classes.fileContentText}>
            {uploadedFile.content}
          </Typography>
        </Box>
      )}

      {rawErrors.length > 0 && (
        <Typography
          color="error"
          variant="caption"
          style={{ marginTop: '8px', display: 'block' }}
        >
          {rawErrors.join(', ')}
        </Typography>
      )}
    </Box>
  );
};
