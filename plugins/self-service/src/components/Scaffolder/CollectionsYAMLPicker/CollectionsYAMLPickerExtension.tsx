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
    // padding: theme.spacing(2),
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

export const CollectionsYAMLPickerExtension = ({
  onChange,
  disabled,
  rawErrors = [],
  schema,
  uiSchema,
  formData,
}: FieldExtensionComponentProps<string>) => {
  const classes = useStyles();

//   const [yamlContent, setYamlContent] = useState<string>('');
  const [yamlInput, setYamlInput] = useState<string>('');
  const [isYAMLDataFrom, setIsYAMLDataFrom] = useState<string>('none');
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

  const handleInputData = (content: string) => {
    if (content) {
      setUploadedFile({ name: 'input-data', content });
      try {
        sessionStorage.setItem(storageKey, 'input-data');
      } catch {
            // Ignore sessionStorage errors (e.g., in private browsing)
      }
      const dataUrl = `data:text/plain;base64,${btoa(content)}`;
      onChange(dataUrl);
    }
  };

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
          setUploadedFile(null);
          setIsYAMLDataFrom('none');
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
        setYamlInput('');
        setUploadedFile(null);
        setIsYAMLDataFrom('none');
      }
    } else if (formData && !formData.includes('data:')) {
    setYamlInput(formData);
      setUploadedFile(null);
      setIsYAMLDataFrom('none');
    }
  }, [formData, schema?.title, storageKey]);

  const handleYAMLChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setYamlInput(value);
    setIsYAMLDataFrom('input');

    if (value.trim()) {
      setUploadedFile(null);

      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore sessionStorage errors (e.g., in private browsing)
      }
      handleInputData(value);
    } else {
      onChange(undefined as any);
      setIsYAMLDataFrom('none');
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        setUploadedFile({ name: file.name, content });
        // setYamlContent('');
        setYamlInput('');
        setIsYAMLDataFrom('file');
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
    // setYamlContent('');
    setIsYAMLDataFrom('none');
    setYamlInput('');

    onChange(undefined as any);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
        // Ignore sessionStorage errors (e.g., in private browsing)
    }
  };

  const isUploadDisabled = disabled || isYAMLDataFrom === 'input';
  const isYAMLDisabled = disabled || isYAMLDataFrom === 'file';

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>

      {customDescription && (
        <Typography className={classes.description} component="div">
          {parseMarkdownLinks(customDescription)}
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
            id={fileInputId}
            type="file"
            accept=".yml,.yaml,.txt"
            onChange={handleFileUpload}
            className={classes.hiddenFileInput}
            disabled={isUploadDisabled}
          />
        </>
      )}
      {uploadedFile && isYAMLDataFrom !== 'input' && (
        <Box className={classes.fileContent}>
          <Box className={classes.fileHeader}>
            <Typography variant="subtitle2">
              {isYAMLDataFrom === 'file' ? `File: ${uploadedFile.name}` : ''}
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
