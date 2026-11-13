import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { EERepositoryDetails } from '@ansible/automation-content-common/eeRepository';
import { useEESelection } from './useEESelection';

const repository: EERepositoryDetails = {
  registry: 'local',
  repository: 'namespace/image',
  entityRef: 'component:default/ee-repo-test',
  representativeRef: 'image@one',
  digests: [
    { digest: 'one', artifactRef: 'image@one' },
    { digest: 'two', artifactRef: 'image@two' },
    { digest: 'tagless', artifactRef: 'image@tagless' },
  ],
  tags: [
    {
      tag: 'build-1',
      digest: 'one',
      artifactRef: 'image@one',
      taggedPullReference: 'image:build-1',
    },
    {
      tag: 'stable',
      digest: 'one',
      artifactRef: 'image@one',
      taggedPullReference: 'image:stable',
    },
    {
      tag: 'build-2',
      digest: 'two',
      artifactRef: 'image@two',
      taggedPullReference: 'image:build-2',
    },
  ],
};

function Fixture() {
  const selection = useEESelection(repository);
  const navigate = useNavigate();
  const { search } = useLocation();
  return (
    <>
      <p>
        {selection.selected?.taggedPullReference ??
          selection.selected?.artifactRef ??
          'Unavailable'}
      </p>
      <p>{selection.section}</p>
      <p>{search}</p>
      <button onClick={() => selection.select('tag:stable')}>Alias</button>
      <button onClick={() => selection.select('tag:build-2')}>
        New digest
      </button>
      <button onClick={() => selection.selectSection('contents')}>
        Contents
      </button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Fixture />
    </MemoryRouter>,
  );
}

it('preserves exact alias and section in history when two aliases share a digest', () => {
  mount('/catalog?tag=build-1');
  expect(screen.getByText('image:build-1')).toBeTruthy();
  fireEvent.click(screen.getByText('Alias'));
  expect(screen.getByText('image:stable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Contents' }));
  expect(screen.getByText('?tag=stable&section=contents')).toBeTruthy();
  fireEvent.click(screen.getByText('New digest'));
  expect(screen.getByText('?tag=build-2&section=contents')).toBeTruthy();
  fireEvent.click(screen.getByText('Back'));
  expect(screen.getByText('image:stable')).toBeTruthy();
  fireEvent.click(screen.getByText('Forward'));
  expect(screen.getByText('image:build-2')).toBeTruthy();
});

it('keeps a removed explicit tag unavailable instead of falling back to a different image', () => {
  mount('/catalog?tag=removed&section=contents');
  expect(screen.getByText('Unavailable')).toBeTruthy();
  expect(screen.getByText('contents')).toBeTruthy();
});

it('opens an explicit tagless digest from a deep link', () => {
  mount('/catalog?digest=tagless');
  expect(screen.getByText('image@tagless')).toBeTruthy();
});

it('keeps an explicit digest pinned even when multiple tags point to it', () => {
  mount('/catalog?digest=one');
  expect(screen.getByText('image@one')).toBeTruthy();
  fireEvent.click(screen.getByText('Contents'));
  expect(screen.getByText('?digest=one&section=contents')).toBeTruthy();
  fireEvent.click(screen.getByText('Alias'));
  expect(screen.getByText('?section=contents&tag=stable')).toBeTruthy();
  expect(screen.getByText('image:stable')).toBeTruthy();
  fireEvent.click(screen.getByText('Back'));
  expect(screen.getByText('image@one')).toBeTruthy();
});

it('keeps an unknown digest unavailable', () => {
  mount('/catalog?digest=missing');
  expect(screen.getByText('Unavailable')).toBeTruthy();
});
