import React, { useState } from 'react';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Page, Header, Content } from '@backstage/core-components';
import { useParams } from 'react-router-dom';
import { CheckCircleOutlined } from '@mui/icons-material';
import { useTaskEventStream } from '@backstage/plugin-scaffolder-react';
import Button from '@mui/material/Button';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { HeaderWithBreadcrumbs } from '../catalog/HeaderWithBreadcrumbs';

export const RunTask = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const { task, completed, loading, error, output, stepLogs } =
    useTaskEventStream(taskId!);
  const taskMetadata = task?.spec?.templateInfo?.entity?.metadata;
  const breadcrumbs = [
    { label: 'Browse', href: '/catalog' },
    { label: taskMetadata?.title || 'Unnamed' },
  ];
  const [showLogs, setShowLogs] = useState(false);

  // Formatting task duration
  // @ts-ignore
  const formatTime = (start: string, end: string | undefined) => {
    if (!start || !end) return '';
    const seconds =
      (new Date(end).getTime() - new Date(start).getTime()) / 1000;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    let timeString = '';
    if (hours > 0) timeString += `${hours} hours `;
    if (minutes > 0) timeString += `${minutes} minutes `;
    if (remainingSeconds > 0 || timeString === '')
      timeString += `${remainingSeconds} seconds`;
    return timeString;
  };

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Template in Progress" />
        <Content>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginTop: '20px',
            }}
          >
            <Typography variant="h6">Executing Template...</Typography>
            <CircularProgress style={{ marginTop: '10px' }} />
          </div>
        </Content>
      </Page>
    );
  }

  return (
    <Page themeId="tool">
      <HeaderWithBreadcrumbs
        title={taskMetadata?.title ?? ''}
        description={taskMetadata?.description ?? ''}
        breadcrumbs={breadcrumbs}
        showStar={false}
      />
      <Content>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: '2px',
            border: '2px solid #E4E4E4',
            borderRadius: '4px',
          }}
        >
          {error ? (
            <>
              <LinearProgress
                style={{ width: '100%' }}
                value={100}
                variant="determinate"
                color="error"
              />
              <div style={{ alignItems: 'center', padding: '37px' }}>
                <div style={{ textAlign: 'center', fontSize: '30px' }}>
                  <ErrorOutlineIcon color="error" fontSize="inherit" />
                </div>
                <Typography fontSize="14px">{error.message}</Typography>
              </div>
            </>
          ) : (
            <>
              {completed && (
                <LinearProgress
                  style={{ width: '100%' }}
                  value={100}
                  variant="determinate"
                  color="success"
                />
              )}
              {!completed && <LinearProgress style={{ width: '100%' }} />}
              <div style={{ alignItems: 'center', padding: '37px' }}>
                <div style={{ textAlign: 'center', fontSize: '30px' }}>
                  {completed ? (
                    <CheckCircleOutlined color="success" fontSize="inherit" />
                  ) : (
                    <CircularProgress
                      style={{ width: '30px', height: '30px' }}
                    />
                  )}
                </div>
                <Typography fontSize="14px">
                  {output?.text && output.text.length > 0
                    ? output.text.map(text => text.title ?? '').join('\n')
                    : taskMetadata?.title}
                </Typography>
              </div>{' '}
            </>
          )}
        </div>
        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            marginLeft: 'auto',
            marginRight: 'auto',
            border: '2px solid #E4E4E4',
            borderRadius: '4px',
            padding: '37px',
            width: '100%',
          }}
        >
          <Button
            onClick={() => setShowLogs(!showLogs)}
            variant="contained"
            style={{ marginRight: '10px' }}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </Button>
          {output?.links?.map((link, index) => (
            <Button
              key={index}
              href={link.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              style={{ marginRight: '10px' }}
            >
              {link.title}
            </Button>
          ))}
        </div>
        {showLogs && (
          <div
            style={{
              marginTop: '20px',
              marginLeft: 'auto',
              marginRight: 'auto',
              border: '2px solid #E4E4E4',
              borderRadius: '4px',
              padding: '37px',
            }}
          >
            {Object.entries(stepLogs).map(
              ([step, logs]) =>
                logs.length > 0 && (
                  <div key={step}>
                    <Typography
                      variant="body2"
                      style={{ fontWeight: 'bold', marginTop: '10px' }}
                    >
                      {step}:
                    </Typography>
                    {logs.map((log, index) => (
                      <Typography
                        key={index}
                        variant="body2"
                        style={{ whiteSpace: 'break-spaces' }}
                      >
                        {log}
                      </Typography>
                    ))}
                  </div>
                ),
            )}
          </div>
        )}
      </Content>
    </Page>
  );
};
