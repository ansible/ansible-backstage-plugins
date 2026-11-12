import { useSearchParams } from 'react-router-dom';
import type { EERepositoryDetails } from '@ansible/automation-content-common/eeRepository';

interface EESelection {
  id: string;
  tag?: string;
  digest: string;
  artifactRef: string;
  taggedPullReference?: string;
}

type EESection = 'overview' | 'contents';

/** Keep the exact tag and active section in history, independently of digest. */
export function useEESelection(repository?: EERepositoryDetails): {
  options: EESelection[];
  selected?: EESelection;
  unavailable: boolean;
  section: EESection;
  select: (id: string) => void;
  selectSection: (section: EESection) => void;
} {
  const [params, setParams] = useSearchParams();
  const tags = repository?.tags ?? [];
  const taggedDigests = new Set(tags.map(tag => tag.digest));
  const options = [
    ...tags.map(tag => ({ ...tag, id: `tag:${tag.tag}` })),
    ...(repository?.digests ?? [])
      .filter(digest => !taggedDigests.has(digest.digest))
      .map(digest => ({ ...digest, id: `digest:${digest.digest}` })),
  ];
  const tag = params.get('tag');
  const digest = params.get('digest');
  const explicitDigest = digest === null ? undefined : `digest:${digest}`;
  const explicitId = tag === null ? explicitDigest : `tag:${tag}`;
  const selected = explicitId
    ? options.find(option => option.id === explicitId)
    : (options.find(
        option => option.artifactRef === repository?.representativeRef,
      ) ?? options[0]);

  return {
    options,
    selected,
    unavailable: Boolean(explicitId && !selected),
    section: params.get('section') === 'contents' ? 'contents' : 'overview',
    select(id) {
      const option: EESelection | undefined = options.find(
        item => item.id === id,
      );
      if (!option) return;
      setParams(previous => {
        const next = new URLSearchParams(previous);
        if (option.tag !== undefined) {
          next.delete('digest');
          next.set('tag', option.tag);
        } else {
          next.delete('tag');
          next.set('digest', option.digest);
        }
        return next;
      });
    },
    selectSection(section) {
      setParams(previous => {
        const next = new URLSearchParams(previous);
        next.set('section', section);
        return next;
      });
    },
  };
}
