import React, { useMemo, useState } from 'react';
import { Page, Header, Content } from '@backstage/core-components';
import { useParams } from 'react-router-dom';
import { useTaskEventStream } from '@backstage/plugin-scaffolder-react';
import { TaskSteps } from '@backstage/plugin-scaffolder-react/alpha';
import {
  Button,
  CircularProgress,
  makeStyles,
  Typography,
} from '@material-ui/core';

const headerStyles = makeStyles(theme => ({
  header_title_color: {
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
  },
  header_subtitle: {
    display: 'inline-block',
    color: theme.palette.type === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#ffffff',
    opacity: 0.8,
    maxWidth: '75ch',
    marginTop: '8px',
    fontWeight: 500,
    lineHeight: 1.57,
  },
}));

export const RunTask = () => {
  const classes = headerStyles();
  const { taskId } = useParams<{ taskId: string }>();
  const { task, completed, loading, error, output, steps, stepLogs } =
    useTaskEventStream(taskId!);
  const taskMetadata = task?.spec?.templateInfo?.entity?.metadata;
  const [showLogs, setShowLogs] = useState(false);

  // Start Over endpoint requires user to have both read (to grab parameters) and create (to create new task) permissions
  const allSteps = useMemo(
    () =>
      task?.spec.steps.map(step => ({
        ...step,
        ...steps?.[step.id],
      })) ?? [],
    [task, steps],
  );

  const activeStep = useMemo(() => {
    for (let i = allSteps.length - 1; i >= 0; i--) {
      if (allSteps[i].status !== 'open') {
        return i;
      }
    }
    return 0;
  }, [allSteps]);

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
      <Header
        pageTitleOverride="Run Task"
        title={
          <span className={classes.header_title_color}>
            {taskMetadata?.title}
          </span>
        }
        subtitle={
          <span className={classes.header_subtitle}>
            {taskMetadata?.description}
          </span>
        }
        style={{ background: 'inherit' }}
      />
      <Content>
        <TaskSteps
          steps={allSteps}
          activeStep={activeStep}
          isComplete={completed}
          isError={Boolean(error)}
        />
        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            marginLeft: 'auto',
            marginRight: 'auto',
            border: '1px solid #E4E4E4',
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
              marginBottom: 30,
              borderRadius: '4px',
              padding: '24px',
              boxShadow:
                '0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)',
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
