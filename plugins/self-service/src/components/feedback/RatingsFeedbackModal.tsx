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
import OpenInNew from '@material-ui/icons/OpenInNew';
import { useAnalytics } from '@backstage/core-plugin-api';
import { Link } from '@backstage/core-components';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Slide,
  SlideProps,
  Snackbar,
  TextField,
  Typography,
} from '@material-ui/core';
import { Rating } from '@material-ui/lab';

type IProps = {
  handleClose: () => void;
  open: boolean;
};

const SlideTransition = React.forwardRef(function Transition(
  props: SlideProps,
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function RatingsFeedbackModal(props: IProps) {
  const analytics = useAnalytics();

  const [ratings, setRatings] = React.useState<number>(0);
  const [feedback, setFeedback] = React.useState<string>('');
  const [shareFeedback, setShareFeedback] = React.useState<boolean>(false);

  const [selectedIssueType, setSelectedIssueType] =
    React.useState<string>('sentiment');
  const [title, setTitle] = React.useState<string>('');
  const [description, setDescription] = React.useState<string>('');

  const [showSnackbar, setShowSnackbar] = React.useState<boolean>(false);
  const [snackbarMsg, setSnackbarMsg] = React.useState<string>(
    'Thank you for sharing your feedback!',
  );

  const handleChange = (event: any) => {
    setSelectedIssueType(event.target.value);
    setShareFeedback(false);
  };

  const checkDisabled = () => {
    if (selectedIssueType === 'sentiment') {
      return !ratings || !feedback || !shareFeedback;
    } else if (selectedIssueType === 'feature-request') {
      return !title || !description || !shareFeedback;
    }
    return false;
  };

  const sendSentimentFeedback = () => {
    // send custom events to analytics provider
    analytics.captureEvent('feedback', 'sentiment', {
      attributes: {
        type: selectedIssueType,
        ratings: ratings,
        feedback,
      },
    });
    setSnackbarMsg('Thank you sharing the ratings and feedback');
    setShowSnackbar(true);
    const clearSentiment = setTimeout(() => {
      setRatings(0);
      setFeedback('');
      setShareFeedback(false);
      clearTimeout(clearSentiment);
    }, 500);
  };

  const sendIssueFeedback = () => {
    // send custom events to analytics provider
    analytics.captureEvent('feedback', 'issue', {
      attributes: {
        type: selectedIssueType,
        title,
        description,
      },
    });
    const msg = `Thank you sharing this feature request`;
    setSnackbarMsg(msg);
    setShowSnackbar(true);
    const clearIssueData = setTimeout(() => {
      setTitle('');
      setDescription('');
      setShareFeedback(false);
      clearTimeout(clearIssueData);
    }, 500);
  };

  const sendFeedback = () => {
    if (selectedIssueType === 'sentiment') sendSentimentFeedback();
    else sendIssueFeedback();
  };

  return (
    <div data-testid="ratings-feedback-modal">
      <Dialog
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        TransitionComponent={SlideTransition}
      >
        <DialogTitle>Share Your Valuable Feedback</DialogTitle>
        <Divider />
        <DialogContent>
          <div style={{ marginTop: '10px', marginBottom: '10px' }}>
            <FormControl fullWidth>
              <InputLabel id="feedback-type">Type of feedback</InputLabel>
              <Select
                labelId="feedback-type"
                id="feedback-type"
                value={selectedIssueType}
                label="Type of feedback"
                onChange={handleChange}
                defaultValue="sentiment"
                data-testid="feedback-type"
              >
                <MenuItem value="sentiment">General Sentiment</MenuItem>
                <MenuItem value="feature-request">Feature Request</MenuItem>
              </Select>
            </FormControl>
          </div>
          {selectedIssueType === 'sentiment' && (
            <div>
              <FormControl fullWidth>
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
                      <sup style={{ fontWeight: 600 }}>*</sup>
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
              <FormControl fullWidth>
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
              </FormControl>
            </div>
          )}
          {selectedIssueType === 'feature-request' && (
            <div style={{ marginTop: '10px' }}>
              <div>
                <FormControl fullWidth>
                  <div data-testid="issue-title">
                    <TextField
                      aria-required
                      required
                      fullWidth
                      variant="outlined"
                      id="title"
                      label="Title"
                      placeholder="Enter a title"
                      value={title}
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
                      label="Description"
                      placeholder="Enter details"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>
                </FormControl>
              </div>
            </div>
          )}
          <FormControl>
            <FormControlLabel
              style={{ marginTop: '10px' }}
              aria-required
              control={
                <Checkbox
                  data-testid="sentiment-checkbox"
                  style={{ margin: '0 8px' }}
                  checked={shareFeedback}
                  onChange={e => setShareFeedback(e.target.checked)}
                  aria-label="I understand that feedback is shared with Red Hat."
                />
              }
              label={
                <span style={{ fontSize: 14 }}>
                  I understand that feedback is shared with Red Hat.
                </span>
              }
            />
            <div style={{ fontSize: 14 }}>
              Red Hat uses your feedback to help improve our products and
              services.
              <br /> For more information, please review&nbsp;
              <Link to="https://www.redhat.com/en/about/privacy-policy">
                Red Hat's Privacy Statement{' '}
                <OpenInNew fontSize="small" style={{ fontSize: '14px' }} />
              </Link>
            </div>

            <div style={{ marginTop: '10px', marginBottom: '20px' }}>
              <Button
                variant="contained"
                color="primary"
                type="submit"
                disabled={checkDisabled()}
                onClick={sendFeedback}
                data-testid="sentiment-submit-btn"
              >
                Submit
              </Button>
            </div>
          </FormControl>
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
