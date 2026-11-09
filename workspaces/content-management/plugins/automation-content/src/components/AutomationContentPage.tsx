import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Breadcrumbs,
  Link,
  Typography,
  makeStyles,
  Tabs,
  Tab,
} from '@material-ui/core';
import {
  Content,
  ContentHeader,
  Header,
  Page,
  SupportButton,
} from '@backstage/core-components';
import {
  NotificationProvider,
  NotificationStack,
  useNotifications,
} from '@ansible/portal-plugin-sdk';
import {
  CollectionView,
  ContentItemView,
  EnvironmentView,
  OverviewView,
} from './views';
import { ArtifactDetailView, ArtifactListView } from './ArtifactViews';

const useStyles = makeStyles(theme => ({
  crumbs: { marginBottom: theme.spacing(2) },
  crumb: { cursor: 'pointer' },
}));

/** Query fields that describe the current content selection, not app mode. */
const CONTENT_PARAMS = [
  'type',
  'ee',
  'collection',
  'item',
  'itemType',
  'artifact',
] as const;

/** Short label for an artifact ref: `registry/repo@sha256:abcd…` → `repo`. */
function shortEnvironment(ref: string): string {
  const withoutDigest = ref.split('@')[0] ?? ref;
  const parts = withoutDigest.split('/');
  return parts.slice(1).join('/') || withoutDigest;
}

/**
 * The content experience.
 *
 * Four levels, each a drill-down from the last:
 *
 *   execution environment → collection → content item → its documentation
 *
 * That mirrors how the content is actually structured, and it is the order someone
 * naturally asks questions in: which image, what does it ship, what can I call, how do
 * I call it.
 *
 * Position lives in the URL so any level can be linked to and survives a reload. Refs
 * contain slashes and a digest, so they travel as query parameters rather than path
 * segments.
 */
/**
 * Portal SDK notification stack, rendered inside the provider so refresh and
 * sync feedback from the content views surfaces as portal notifications.
 */
const ContentNotifications = () => {
  const { notifications, removeNotification } = useNotifications();
  return (
    <NotificationStack
      notifications={notifications}
      onClose={removeNotification}
    />
  );
};

const AutomationContentPageContent = () => {
  const classes = useStyles();
  const [params, setParams] = useSearchParams();

  const environmentRef = params.get('ee') ?? undefined;
  const collectionFqcn = params.get('collection') ?? undefined;
  const itemFqcn = params.get('item') ?? undefined;
  const itemType = params.get('itemType') ?? undefined;
  const artifactRef = params.get('artifact') ?? undefined;
  const requestedType = params.get('type');
  const contentType =
    requestedType === 'skill' || requestedType === 'collection'
      ? requestedType
      : 'execution-environment';
  const navigateContent = useCallback(
    (values: Record<string, string | undefined>) => {
      setParams(current => {
        const next = new URLSearchParams(current);
        CONTENT_PARAMS.forEach(key => next.delete(key));
        Object.entries(values).forEach(([key, value]) => {
          if (value === undefined || value === '') next.delete(key);
          else next.set(key, value);
        });
        return next;
      });
    },
    [setParams],
  );
  const goArtifact = (ref: string) =>
    navigateContent({ type: contentType, artifact: ref });

  const goHome = useCallback(
    () => navigateContent({ type: contentType }),
    [navigateContent, contentType],
  );
  const goEnvironment = useCallback(
    (ref: string) => navigateContent({ ee: ref }),
    [navigateContent],
  );
  const goCollection = useCallback(
    (fqcn: string) =>
      navigateContent({ ee: environmentRef!, collection: fqcn }),
    [navigateContent, environmentRef],
  );
  const goItem = useCallback(
    (fqcn: string, selectedItemType: string) =>
      navigateContent({
        ee: environmentRef!,
        collection: collectionFqcn!,
        item: fqcn,
        itemType: selectedItemType,
      }),
    [navigateContent, environmentRef, collectionFqcn],
  );

  const crumb = (label: string, onClick?: () => void) =>
    onClick ? (
      <Link
        key={label}
        color="inherit"
        className={classes.crumb}
        onClick={onClick}
      >
        {label}
      </Link>
    ) : (
      <Typography key={label} color="textPrimary">
        {label}
      </Typography>
    );

  const crumbs = [
    crumb(
      {
        skill: 'Skills',
        collection: 'Collection artifacts',
        'execution-environment': 'Execution environments',
      }[contentType],
      environmentRef || artifactRef ? goHome : undefined,
    ),
  ];
  if (artifactRef)
    crumbs.push(
      crumb(
        shortEnvironment(artifactRef),
        itemFqcn ? () => goArtifact(artifactRef) : undefined,
      ),
    );
  if (environmentRef) {
    crumbs.push(
      crumb(
        shortEnvironment(environmentRef),
        collectionFqcn ? () => goEnvironment(environmentRef) : undefined,
      ),
    );
  }
  if (collectionFqcn) {
    crumbs.push(
      crumb(
        collectionFqcn,
        itemFqcn ? () => goCollection(collectionFqcn) : undefined,
      ),
    );
  }
  if (itemFqcn) {
    crumbs.push(crumb(itemFqcn.split('.').pop() ?? itemFqcn));
  }

  let body: React.ReactNode;
  let title = 'Content';

  if (artifactRef && itemFqcn) {
    title = itemFqcn;
    body = (
      <ContentItemView
        environmentRef={artifactRef}
        fqcn={itemFqcn}
        itemType={itemType}
      />
    );
  } else if (artifactRef) {
    title = shortEnvironment(artifactRef);
    body = (
      <ArtifactDetailView
        artifactRef={artifactRef}
        onOpenItem={(fqcn, selectedItemType) =>
          navigateContent({
            type: contentType,
            artifact: artifactRef,
            item: fqcn,
            itemType: selectedItemType,
          })
        }
      />
    );
  } else if (contentType !== 'execution-environment') {
    body = <ArtifactListView type={contentType} onOpen={goArtifact} />;
  } else if (environmentRef && collectionFqcn && itemFqcn) {
    title = itemFqcn;
    body = (
      <ContentItemView
        environmentRef={environmentRef}
        fqcn={itemFqcn}
        itemType={itemType}
      />
    );
  } else if (environmentRef && collectionFqcn) {
    title = collectionFqcn;
    body = (
      <CollectionView
        environmentRef={environmentRef}
        collectionFqcn={collectionFqcn}
        onOpenItem={goItem}
      />
    );
  } else if (environmentRef) {
    title = shortEnvironment(environmentRef);
    body = (
      <EnvironmentView
        environmentRef={environmentRef}
        onOpenCollection={goCollection}
      />
    );
  } else {
    body = <OverviewView onOpenEnvironment={goEnvironment} />;
  }

  return (
    <Page themeId="tool">
      <Header
        title="Automation content"
        subtitle="Discover, inspect and govern Ansible content across any OCI-compliant registry"
      />
      <Content>
        <ContentHeader title={title}>
          <SupportButton>
            Content is discovered from configured OCI registries. Inventories
            generated at image build time are exact; anything derived by
            inspecting an image afterwards is approximate and labelled as such.
          </SupportButton>
        </ContentHeader>

        <Tabs
          value={contentType}
          onChange={(_event, type: string) => navigateContent({ type })}
          aria-label="Content type"
        >
          <Tab value="execution-environment" label="Execution environments" />
          <Tab value="skill" label="Skills" />
          <Tab value="collection" label="Collection artifacts" />
        </Tabs>

        {crumbs.length > 1 && (
          <Breadcrumbs className={classes.crumbs} aria-label="breadcrumb">
            {crumbs}
          </Breadcrumbs>
        )}

        {body}
      </Content>
    </Page>
  );
};

export const AutomationContentPage = () => (
  <NotificationProvider>
    <AutomationContentPageContent />
    <ContentNotifications />
  </NotificationProvider>
);
