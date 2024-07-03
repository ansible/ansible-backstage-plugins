/*
 * Copyright 2024 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as React from 'react';
import { Rating } from '@material-ui/lab';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Slide,
  SlideProps,
  Snackbar,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { configApiRef, useAnalytics, useApi } from '@backstage/core-plugin-api';

const feedbackModalStyles = makeStyles(theme => ({
  required: {
    color: '#c00',
  },
  fw_600: {
    fontWeight: 600,
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: 180,
  },
}));

type IProps = {
  handleClose: () => void;
};

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export default function RatingsFeedbackModal(props: IProps) {
  const config = useApi(configApiRef);
  const classes = feedbackModalStyles();
  const analytics = useAnalytics();

  const [ratings, setRatings] = React.useState<number>(0);
  const [feedback, setFeedback] = React.useState<string>('');
  const [shareSentimentFeedback, setShareSentimentFeedback] =
    React.useState<boolean>(false);

  const [selectedIssueType, setSelectedIssueType] = React.useState<string>('');
  const [title, setTitle] = React.useState<string>('');
  const [description, setDescription] = React.useState<string>('');
  const [shareIssueFeedback, setShareIssueFeedback] =
    React.useState<boolean>(false);

  const [showSnackbar, setShowSnackbar] = React.useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = React.useState<string>(
    'Thank you for sharing your feedback!',
  );

  const handleChange = (event: any) => {
    setSelectedIssueType(event.target.value);
  };

  const sendSentimentFeedback = () => {
    // send custom events to analytics provider
    analytics.captureEvent('feedback', 'sentiment', {
      attributes: {
        ratings: ratings,
        feedback: feedback,
      },
    });
    setSnackbarMsg('Thank you sharing the ratings and feedback');
    setShowSnackbar(true);
    const clearSentiment = setTimeout(() => {
      setRatings(0);
      setFeedback('');
      setShareSentimentFeedback(false);
      clearTimeout(clearSentiment);
    }, 500);
  };

  const sendIssueFeedback = () => {
    if (config)
      // send custom events to analytics provider
      analytics.captureEvent('feedback', 'issue', {
        attributes: {
          type: selectedIssueType,
          title: title,
          description: description,
        },
      });
    const msg = `Thank you sharing ${
      selectedIssueType.includes('feature') ? 'this' : 'the'
    } ${selectedIssueType.split('-').join(' ')}.`;
    setSnackbarMsg(msg);
    setShowSnackbar(true);
    const clearIssueData = setTimeout(() => {
      setSelectedIssueType('');
      setTitle('');
      setDescription('');
      setShareIssueFeedback(false);
      clearTimeout(clearIssueData);
    }, 500);
  };

  return (
    <div data-testid="ratings-feedback-modal">
      <Dialog
        open
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        TransitionComponent={SlideTransition}
      >
        <DialogTitle>Share Your Valuable Feedback</DialogTitle>
        <Divider />
        <DialogContent>
          <FormControl className={classes.formControl}>
            <div
              style={{ marginTop: '10px', marginBottom: '10px' }}
              data-testid="user-ratings"
            >
              <Typography
                component="div"
                id="modal-modal-description"
                style={{ marginTop: 2 }}
              >
                <Typography>
                  How was your experience?
                  <sup className={`${classes.required} ${classes.fw_600}`}>
                    *
                  </sup>
                </Typography>
                <Rating
                  name="user-ratings"
                  value={ratings}
                  onChange={(e, newRatings) => {
                    e.stopPropagation();
                    if (newRatings) setRatings(newRatings);
                  }}
                  style={{ marginTop: '10px' }}
                />
              </Typography>
            </div>
          </FormControl>
          <Divider />
          <FormControl className={classes.formControl}>
            <div style={{ marginTop: '15px' }} data-testid="tell-us-why">
              <TextField
                multiline
                variant="outlined"
                aria-required
                required
                minRows={10}
                id="title"
                label="Tell us why?"
                placeholder="Enter feedback"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                fullWidth
              />
            </div>
            <FormControlLabel
              style={{ marginTop: '10px' }}
              aria-required
              control={
                <Checkbox
                  data-testid="sentiment-checkbox"
                  required
                  checked={shareSentimentFeedback}
                  onChange={e => setShareSentimentFeedback(e.target.checked)}
                  aria-label="I understand that feedback is shared with Red Hat."
                />
              }
              label="I understand that feedback is shared with Red Hat."
            />

            <div style={{ marginTop: '10px', marginBottom: '20px' }}>
              <Button
                variant="contained"
                color="primary"
                type="submit"
                disabled={!ratings || !feedback || !shareSentimentFeedback}
                onClick={sendSentimentFeedback}
                data-testid="sentiment-submit-btn"
              >
                Submit
              </Button>
            </div>
          </FormControl>
          <Divider />
          <div style={{ marginTop: '10px' }}>
            <div>
              <Typography component="h6" variant="h6">
                Tell us more
              </Typography>
              <FormControl className={classes.formControl}>
                <Select
                  labelId="select-issue-type"
                  id="select-issue-type"
                  value={selectedIssueType}
                  label="Select Issue Type"
                  onChange={handleChange}
                  defaultValue="Select Issue Type"
                  displayEmpty
                  data-testid="select-issue-type"
                >
                  <MenuItem value="">Select Issue Type</MenuItem>
                  <MenuItem value="bug-report">Bug Report</MenuItem>
                  <MenuItem value="feature-request">Feature Request</MenuItem>
                </Select>
              </FormControl>
            </div>
            {selectedIssueType !== '' && (
              <div>
                <FormControl className={classes.formControl}>
                  <div data-testid="issue-title">
                    <TextField
                      aria-required
                      required
                      fullWidth
                      variant="outlined"
                      id="title"
                      label="Title"
                      placeholder="Enter a title"
                      onChange={e => setTitle(e.target.value)}
                    />
                  </div>
                  <div
                    style={{ marginTop: '30px' }}
                    data-testid="issue-description"
                  >
                    <TextField
                      aria-required
                      multiline
                      required
                      fullWidth
                      variant="outlined"
                      minRows={10}
                      id="title"
                      label={
                        selectedIssueType === 'bug-report'
                          ? 'Steps to reproduce'
                          : 'Description'
                      }
                      placeholder="Enter details"
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>
                  <FormControlLabel
                    style={{ marginTop: '10px' }}
                    control={
                      <Checkbox
                        data-testid="issue-checkbox"
                        required
                        aria-required
                        checked={shareIssueFeedback}
                        onChange={e => setShareIssueFeedback(e.target.checked)}
                        aria-label="I understand that feedback is shared with Red Hat."
                      />
                    }
                    label="I understand that feedback is shared with Red Hat."
                  />

                  <div style={{ marginTop: '10px', marginBottom: '20px' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      type="submit"
                      disabled={!title || !description || !shareIssueFeedback}
                      onClick={sendIssueFeedback}
                      data-testid="issue-submit-btn"
                    >
                      Submit
                    </Button>
                  </div>
                </FormControl>
              </div>
            )}
          </div>
        </DialogContent>
        <Snackbar
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          open={showSnackbar}
          onClose={() => setShowSnackbar(false)}
          autoHideDuration={3000}
          message={snackbarMsg}
        />
      </Dialog>
    </div>
  );
}
