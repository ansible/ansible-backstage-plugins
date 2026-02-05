import { ChangeEvent, useState, useEffect, useRef } from 'react';
import { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { Button, Typography, Box, TextField } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import UploadIcon from '@material-ui/icons/CloudUpload';
import DeleteIcon from '@material-ui/icons/Delete';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';

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
  textArea: {
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
  fileDisplayBox: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  checkIcon: {
    color: theme.palette.success.main,
    marginRight: theme.spacing(1.5),
  },
  fileName: {
    color: theme.palette.primary.main,
    fontWeight: 500,
    marginRight: theme.spacing(1),
    cursor: 'pointer',
  },
  fileSize: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  removeButton: {
    display: 'flex',
    alignItems: 'center',
    color: theme.palette.primary.main,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  removeText: {
    marginRight: theme.spacing(0.5),
    fontSize: '0.875rem',
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

  const [textInput, setTextInput] = useState<string>('');
  const [dataSource, setIsDataSource] = useState<string>('none');
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const isInitialized = useRef(false);

  const customTitle =
    uiSchema?.['ui:options']?.title || schema?.title || 'Upload File';
  const customPlaceholder =
    uiSchema?.['ui:options']?.placeholder ||
    schema?.['ui:placeholder'] ||
    'Paste the content here. Alternatively, upload a file.';
  const customButtonText =
    uiSchema?.['ui:options']?.buttonText ||
    schema?.['ui:buttonText'] ||
    'Upload File';

  const fileInputId = `file-upload-input-${
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().toString().replaceAll('-', '').substring(2, 11)
      : Date.now().toString(36).substring(2, 11)
  }`;

  const storageKey = `file-upload-filename-${schema?.title || 'default'}`;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
  };

  const handleTextInput = (content: string) => {
    if (content) {
      setUploadedFile({ name: 'input-data', content });
      sessionStorage.setItem(storageKey, 'input-data');
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
      setIsDataSource('none');
      setTextInput('');
      return;
    }

    if (formData && formData.startsWith('data:text/plain;base64,')) {
      try {
        const base64Content = formData.split(',')[1];
        if (!base64Content) {
          setUploadedFile(null);
          setIsDataSource('none');
          return;
        }
        const content = atob(base64Content);

        let fileName: string;
        try {
          const storedFilename = sessionStorage.getItem(storageKey);
          if (storedFilename) {
            fileName = storedFilename;
            if (fileName === 'input-data') {
              setIsDataSource('input');
              setTextInput(content);
            } else {
              setIsDataSource('file');
              setTextInput('');
            }
          } else {
            fileName = schema?.title
              ? `${schema.title.toLowerCase().replaceAll(/\s+/g, '-')}.txt`
              : 'uploaded-file.txt';
            setIsDataSource('file');
            setTextInput('');
          }
        } catch {
          fileName = schema?.title
            ? `${schema.title.toLowerCase().replaceAll(/\s+/g, '-')}.txt`
            : 'uploaded-file.txt';
          setIsDataSource('file');
          setTextInput('');
        }

        setUploadedFile(prev => {
          if (prev?.content === content && prev?.name === fileName) {
            return prev;
          }
          return { name: fileName, content };
        });
      } catch {
        setTextInput('');
        setUploadedFile(null);
        setIsDataSource('none');
      }
    } else if (formData && !formData.includes('data:')) {
      setTextInput(formData);
      setUploadedFile(null);
      setIsDataSource('input');
    }
  }, [formData, schema?.title, storageKey]);

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTextInput(value);
    setIsDataSource('input');

    if (value.trim()) {
      setUploadedFile(null);
      sessionStorage.removeItem(storageKey);
      handleTextInput(value);
    } else {
      onChange(undefined as any);
      setIsDataSource('none');
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const content = await file.text();
        setUploadedFile({ name: file.name, content });
        setTextInput('');
        setIsDataSource('file');
        sessionStorage.setItem(storageKey, file.name);
        const dataUrl = `data:text/plain;base64,${btoa(content)}`;
        onChange(dataUrl);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to read file:', error);
      }
    }
  };

  const triggerFileUpload = () => {
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    fileInput?.click();
  };

  const clearFile = () => {
    setUploadedFile(null);
    setIsDataSource('none');
    setTextInput('');
    onChange(undefined as any);
    sessionStorage.removeItem(storageKey);
  };

  const isUploadDisabled = disabled || dataSource === 'input';
  const isTextDisabled = disabled || dataSource === 'file';

  return (
    <Box>
      <Typography className={classes.title}>{customTitle}</Typography>
      {dataSource !== 'file' && (
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={12}
          value={textInput}
          onChange={handleTextChange}
          disabled={isTextDisabled}
          placeholder={customPlaceholder}
          className={classes.textArea}
          variant="outlined"
        />
      )}

      {dataSource !== 'file' && dataSource !== 'input' && (
        <>
          <Button
            variant="text"
            startIcon={<UploadIcon />}
            onClick={triggerFileUpload}
            disabled={isUploadDisabled}
            className={classes.uploadButton}
          >
            {customButtonText}
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

      {uploadedFile && dataSource === 'file' && (
        <Box className={classes.fileDisplayBox}>
          <Box className={classes.fileInfo}>
            <CheckCircleIcon className={classes.checkIcon} />
            <Box>
              <Typography className={classes.fileName} component="span">
                {uploadedFile.name}
              </Typography>
              <Typography className={classes.fileSize} component="span">
                {formatFileSize(new Blob([uploadedFile.content]).size)}
              </Typography>
            </Box>
          </Box>
          <Box
            className={classes.removeButton}
            onClick={clearFile}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clearFile();
              }
            }}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <Typography className={classes.removeText} component="span">
              remove
            </Typography>
            <DeleteIcon fontSize="small" />
          </Box>
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
