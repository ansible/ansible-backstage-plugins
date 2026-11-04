import { fireEvent, render, screen } from '@testing-library/react';
import {
  DefinitionFileOverview,
  type DefinitionFileOverviewProps,
} from './DefinitionFileOverview';

const props: DefinitionFileOverviewProps = {
  entity: {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'example', title: 'Not a description' },
  },
  ownerName: '',
  parsedDefinition: null,
  hasDefinition: false,
  isRefreshing: false,
  isDownloadExperience: false,
  onRefresh: jest.fn(),
  onRetrySourceFiles: jest.fn(),
  onEditDefinition: jest.fn(),
  onDownloadArchive: jest.fn(),
};

it('reports missing inline content without inventing metadata', () => {
  render(<DefinitionFileOverview {...props} />);
  expect(screen.getByText('Not a description')).toBeTruthy();
  expect(screen.getByText('No README available.')).toBeTruthy();
  expect(screen.getByText('No definition file available.')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(3);
  expect(screen.queryByRole('heading', { name: 'Links' })).toBeNull();
});

it('rejects unsafe source, edit and entity links', () => {
  render(
    <DefinitionFileOverview
      {...props}
      // Intentionally unsafe inputs exercise URL rejection.
      // eslint-disable-next-line no-script-url
      sourceLocationUrl="javascript:alert(1)"
      // eslint-disable-next-line no-script-url
      editDefinitionUrl="javascript:alert(1)"
      entity={{
        ...props.entity,
        metadata: {
          ...props.entity.metadata,
          links: [
            { url: 'data:text/html,unsafe', title: 'Unsafe' },
            { url: 'https://user:secret@example.com', title: 'Credentials' },
            { url: 'https://example.com/docs', title: 'Documentation' },
          ],
        },
      }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Edit definition' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Credentials' })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Documentation' }).getAttribute('href'),
  ).toBe('https://example.com/docs');
});

it('provides download actions instead of source and refresh in download mode', () => {
  render(
    <DefinitionFileOverview
      {...props}
      isDownloadExperience
      sourceLocationUrl="https://example.com"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Download EE files' }));
  expect(props.onDownloadArchive).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Refresh definition details' }),
  ).toBeNull();
  expect(screen.queryByText('Source')).toBeNull();
});
