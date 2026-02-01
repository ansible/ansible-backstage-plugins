import { ChangeEvent, useState, useEffect, useRef } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import {
  Button,
  Typography,
  Box,
  IconButton,
  TextField,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import DeleteIcon from '@material-ui/icons/Delete';
import { parseMarkdownLinks } from '../utils/parseMarkdownLinks';
import UploadIcon from '@material-ui/icons/CloudUpload';

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
  yamlTextArea: {
    marginBottom: theme.spacing(2),
    '& .MuiInputBase-root': {
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    },
  },
  uploadButton: {
    textTransform: 'none',
    fontSize: '15px',
    marginBottom: theme.spacing(2),
    color: theme.palette.primary.main,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&:disabled': {
      color: theme.palette.action.disabled,
    },
    '& .MuiButton-startIcon': {
      marginRight: theme.spacing(1),
    },
  },
  fileUploadContent: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
  },
  fileUploadContentText: {
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  hideFileInput: {
    display: 'none',
  },
  filePickerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
}));

export const CollectionsYAMLPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();

  const [yamlInput, setYamlInput] = useState<string>('');
  const [isYAMLDataFrom, setIsYAMLDataFrom] = useState<string>('none');
  const [fileData, setFileData] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const isInitalize = useRef(false);

  const modifiedTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Upload File';
  const modifiedDescription =
    uiSchema?.['ui:options']?.description || schema?.description;

  const fileInputIdentifier = `file-upload-input-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().toString().replaceAll('-', '').substring(2, 11)
      : Date.now().toString(36).substring(2, 11)
  }`;

  const dataStorageKey = `file-upload-filename-${schema?.title || 'default'}`;

  const handleInputData = (content: string) => {
    if (content) {
      setFileData({ name: 'input-data', content });
      try {
        sessionStorage.setItem(dataStorageKey, 'input-data');
      } catch {
        // Ignore sessionStorage errors (e.g., in private browsing)
      }
      const dataUrl = `data:text/plain;base64,${btoa(content)}`;
      onChange(dataUrl);
    }
  };

  useEffect(() => {
    if (!isInitalize.current && formData === '') {
      onChange(undefined as any);
      isInitalize.current = true;
    } else if (formData && formData !== '') {
      isInitalize.current = true;
    }
  }, [formData, onChange]);

  useEffect(() => {
    if (!formData || formData === '') {
      setFileData(null);
      setIsYAMLDataFrom('none');

      return;
    }

    if (
      formData &&
      formData.length > 0 &&
      formData.startsWith('data:text/plain;base64,')
    ) {
      try {
        const base64Content = formData.split(',')[1];
        if (!base64Content) {
          setFileData(null);
          setIsYAMLDataFrom('none');
          return;
        }
        const content = atob(base64Content);

        let fileName: string;
        try {
          const storedFilename = sessionStorage.getItem(dataStorageKey);
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

        setFileData(prev => {
          if (prev?.content === content && prev?.name === fileName) {
            return prev;
          }
          return { name: fileName, content };
        });
      } catch {
        setYamlInput('');
        setFileData(null);
        setIsYAMLDataFrom('none');
      }
    } else if (formData && !formData.includes('data:')) {
      setYamlInput(formData);
      setFileData(null);
      setIsYAMLDataFrom('none');
    }
  }, [formData, schema?.title, dataStorageKey]);

  const handleYAMLChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setYamlInput(value);
    setIsYAMLDataFrom('input');

    if (value.trim()) {
      setFileData(null);

      try {
        sessionStorage.removeItem(dataStorageKey);
      } catch {
        // Ignore sessionStorage errors (e.g., in private browsing)
      }
      handleInputData(value);
    } else {
      onChange(undefined as any);
      setIsYAMLDataFrom('none');
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const content = await file.text();
      setFileData({ name: file.name, content });
      setYamlInput('');
      setIsYAMLDataFrom('file');
      try {
        sessionStorage.setItem(dataStorageKey, file.name);
      } catch {
        // Ignore sessionStorage errors (e.g., in private browsing)
      }
      const dataUrl = `data:text/plain;base64,${btoa(content)}`;
      onChange(dataUrl);
    }
  };
  const triggerFileUpload = () => {
    const fileInput = document.getElementById(
      fileInputIdentifier,
    ) as HTMLInputElement;
    fileInput?.click();
  };

  const clearFile = () => {
    setFileData(null);
    setIsYAMLDataFrom('none');
    setYamlInput('');

    onChange(undefined as any);
    try {
      sessionStorage.removeItem(dataStorageKey);
    } catch {
      // Ignore sessionStorage errors (e.g., in private browsing)
    }
  };

  const isUploadDisabled = disabled || isYAMLDataFrom === 'input';
  const isYAMLDisabled = disabled || isYAMLDataFrom === 'file';

  return (
    <Box>
      <Typography className={classes.title}>{modifiedTitle}</Typography>

      {modifiedDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(modifiedDescription)}
        </Typography>
      )}
      {isYAMLDataFrom !== 'file' && (
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={12}
          value={yamlInput}
          onChange={handleYAMLChange}
          disabled={isYAMLDisabled}
          placeholder="Paste the full content of your requirements.yml file here. Alternatively, Upload YAML file."
          className={classes.yamlTextArea}
          variant="outlined"
        />
      )}
      {isYAMLDataFrom !== 'file' && isYAMLDataFrom !== 'input' && (
        <>
          <Button
            variant="text"
            startIcon={<UploadIcon />}
            onClick={triggerFileUpload}
            disabled={isUploadDisabled}
            className={classes.uploadButton}
          >
            Upload YAML File
          </Button>

          <input
            id={fileInputIdentifier}
            type="file"
            accept=".yml,.yaml,.txt"
            onChange={handleFileUpload}
            className={classes.hideFileInput}
            disabled={isUploadDisabled}
          />
        </>
      )}
      {fileData && isYAMLDataFrom !== 'input' && (
        <Box className={classes.fileUploadContent}>
          <Box className={classes.filePickerHeader}>
            <Typography variant="subtitle2">
              {isYAMLDataFrom === 'file' ? `File: ${fileData.name}` : ''}
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
          <Typography className={classes.fileUploadContentText}>
            {fileData.content}
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
