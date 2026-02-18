import { makeStyles } from '@material-ui/core/styles';

export const useCollectionsStyles = makeStyles(theme => ({
  pageHeader: {
    marginBottom: theme.spacing(2),
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(1.5),
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  syncButton: {
    textTransform: 'none',
    fontWeight: 500,
  },
  headerTitleText: {
    fontWeight: 700,
    fontSize: '1.75rem',
  },
  helpIcon: {
    color: theme.palette.text.secondary,
    cursor: 'pointer',
    fontSize: '1.25rem',
    '&:hover': {
      color: theme.palette.primary.main,
    },
  },
  description: {
    color: theme.palette.text.secondary,
    fontSize: 15,
    lineHeight: 1.5,
    maxWidth: '900px',
    marginBottom: theme.spacing(5),
  },
  searchInput: {
    marginBottom: theme.spacing(2),
  },
  catalogLayout: {
    '& [class*="CatalogFilterLayout-root"]': {
      alignItems: 'flex-start',
    },
    '& [class*="CatalogFilterLayout-content"]': {
      paddingTop: 0,
    },
  },
  flex: {
    display: 'flex',
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    alignItems: 'center',
  },
  paper: {
    padding: theme.spacing(0.75, 1.5),
    borderRadius: 3,
  },
  entityLink: {
    cursor: 'pointer',
    color: theme.palette.primary.main,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    fontWeight: 500,
    textAlign: 'left',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  actionButton: {
    cursor: 'pointer',
    padding: theme.spacing(0.5),
    '&:hover': {
      opacity: 0.7,
    },
  },
  namespaceChip: {
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
    fontWeight: 500,
  },
  versionChip: {
    backgroundColor: theme.palette.action.selected,
    color: theme.palette.text.primary,
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(8),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateIcon: {
    fontSize: '5rem',
    color: theme.palette.text.disabled,
    marginBottom: theme.spacing(3),
  },
  emptyStateTitle: {
    marginBottom: theme.spacing(2),
    fontWeight: 600,
  },
  emptyStateDescription: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(3),
    maxWidth: 500,
  },
  emptyStateSyncButton: {
    marginTop: theme.spacing(1),
    textTransform: 'none',
  },
  emptyStateDocsLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(2),
    color: theme.palette.primary.main,
    textDecoration: 'none',
    fontWeight: 500,
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  emptyStateDocsIcon: {
    fontSize: '1rem',
  },
  cardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gridAutoRows: '1fr',
    gap: theme.spacing(2),
    width: '100%',
  },
  collectionCard: {
    height: '100%',
    minHeight: 200,
    display: 'flex',
    flexDirection: 'column',
    transition: 'box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out',
    cursor: 'pointer',
    '&:hover': {
      boxShadow: theme.shadows[4],
      transform: 'translateY(-2px)',
    },
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: theme.spacing(2),
    '&:last-child': {
      paddingBottom: theme.spacing(2),
    },
  },
  cardTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing(0.5),
  },
  cardTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    color: theme.palette.primary.main,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    marginRight: theme.spacing(1),
  },
  starButton: {
    padding: theme.spacing(0.5),
    marginTop: -4,
    marginRight: -4,
  },
  starIcon: {
    color: '#f5a623',
    fontSize: '1.25rem',
  },
  starIconEmpty: {
    color: theme.palette.text.secondary,
    fontSize: '1.25rem',
    '&:hover': {
      color: '#f5a623',
    },
  },
  cardVersion: {
    display: 'inline-flex',
    alignItems: 'center',
    marginBottom: theme.spacing(1),
  },
  cardSource: {
    marginBottom: theme.spacing(0.5),
  },
  sourceLabel: {
    fontWeight: 600,
    color: theme.palette.text.primary,
    fontSize: '0.85rem',
  },
  sourceLink: {
    display: 'inline-flex',
    alignItems: 'center',
    color: theme.palette.primary.main,
    fontSize: '0.85rem',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  sourceLinkText: {
    wordBreak: 'break-all',
  },
  sourceLinkIcon: {
    fontSize: '0.9rem',
    marginLeft: theme.spacing(0.5),
    flexShrink: 0,
  },
  sourceText: {
    color: theme.palette.text.secondary,
    fontSize: '0.85rem',
  },
  lastSync: {
    marginTop: 'auto',
    paddingTop: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
  },
  paginationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(3),
    padding: theme.spacing(1, 0),
  },
  paginationInfo: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  contentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  contentTitle: {
    fontWeight: 600,
  },
  syncDialog: {
    '& .MuiDialog-paper': {
      borderRadius: 16,
    },
  },
  dialogTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2, 3),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  dialogTitleText: {
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  dialogDescription: {
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    marginTop: theme.spacing(0.5),
  },
  closeButton: {
    marginRight: -8,
  },
  dialogContent: {
    minWidth: 400,
    minHeight: 200,
    padding: theme.spacing(2, 3),
  },
  treeList: {
    width: '100%',
    padding: 0,
  },
  nestedListLevel1: {
    paddingLeft: theme.spacing(3),
  },
  nestedListLevel2: {
    paddingLeft: theme.spacing(7),
  },
  treeItemText: {
    '& .MuiListItemText-primary': {
      fontSize: '0.9rem',
    },
  },
  expandIcon: {
    minWidth: 28,
    color: theme.palette.text.secondary,
  },
  checkboxIcon: {
    minWidth: 36,
  },
  scmProviderItem: {
    backgroundColor: theme.palette.action.hover,
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(0.5),
  },
  hostItem: {
    marginBottom: theme.spacing(0.25),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
  },
  orgItem: {
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
  },
  providerIcon: {
    minWidth: 32,
  },
  syncDialogActions: {
    padding: theme.spacing(2, 3),
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  selectAllButton: {
    marginRight: 'auto',
  },
  detailsContainer: {
    padding: theme.spacing(3),
  },
  detailsContent: {
    display: 'flex',
    gap: theme.spacing(3),
    marginTop: theme.spacing(3),
    alignItems: 'flex-start',
  },
  detailsLeftColumn: {
    flex: 1,
    minWidth: 0,
  },
  detailsRightColumn: {
    width: 340,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(3),
  },
  detailsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing(1),
  },
  detailsTitle: {
    fontWeight: 700,
    fontSize: '1.75rem',
  },
  detailsDescription: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  detailsTabs: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(3),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  aboutCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  aboutCardContent: {
    padding: theme.spacing(2.5),
  },
  aboutCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  aboutCardTitle: {
    fontWeight: 600,
    fontSize: '1.25rem',
  },
  aboutCardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  aboutCardSection: {
    marginTop: theme.spacing(2),
  },
  aboutCardLabel: {
    color: theme.palette.text.secondary,
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing(0.5),
  },
  aboutCardValue: {
    fontSize: '0.875rem',
    wordBreak: 'break-word' as const,
  },
  aboutCardDivider: {
    margin: theme.spacing(2, -2.5),
  },
  aboutCardTagsContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: theme.spacing(0.75),
    marginTop: theme.spacing(1),
  },
  aboutCardTag: {
    borderRadius: 6,
    borderColor: theme.palette.divider,
    textTransform: 'none' as const,
    fontSize: '0.75rem',
    padding: theme.spacing(0.25, 1),
  },
  aboutSourceLink: {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  aboutSourceIcon: {
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  resourcesCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  resourcesCardContent: {
    padding: theme.spacing(2.5),
  },
  resourcesCardTitle: {
    fontWeight: 600,
    fontSize: '1.25rem',
    marginBottom: theme.spacing(2),
  },
  resourceLink: {
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    textDecoration: 'none',
    color: 'inherit',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&:last-child': {
      marginBottom: 0,
    },
  },
  resourceLinkIcon: {
    marginRight: theme.spacing(1.5),
    color: theme.palette.primary.main,
    fontSize: '1.5rem',
  },
  resourceLinkText: {
    fontWeight: 500,
  },
  resourceLinkDescription: {
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
  },
  readmeCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  readmeCardHeader: {
    padding: theme.spacing(2, 2.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  readmeCardTitle: {
    fontWeight: 600,
    fontSize: '1.1rem',
  },
  readmeCardContent: {
    flex: 1,
    padding: theme.spacing(2, 2.5),
    overflow: 'auto',
    maxHeight: '65vh',
    '&::-webkit-scrollbar': {
      width: 6,
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: theme.palette.divider,
      borderRadius: 3,
    },
  },
  readmeLoading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing(4),
  },
  readmeEmpty: {
    textAlign: 'center' as const,
    padding: theme.spacing(4),
    color: theme.palette.text.secondary,
  },
  readmeHtmlContent: {
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
      fontWeight: 600,
    },
    '& h1': { fontSize: '1.75rem' },
    '& h2': { fontSize: '1.5rem' },
    '& h3': { fontSize: '1.25rem' },
    '& p': {
      marginBottom: theme.spacing(1.5),
      lineHeight: 1.6,
    },
    '& ul, & ol': {
      paddingLeft: theme.spacing(3),
      marginBottom: theme.spacing(1.5),
    },
    '& li': {
      marginBottom: theme.spacing(0.5),
    },
    '& code': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(0, 0, 0, 0.05)',
      padding: '2px 6px',
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: '0.9em',
    },
    '& pre': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(0, 0, 0, 0.05)',
      padding: theme.spacing(2),
      borderRadius: 4,
      overflow: 'auto',
      '& code': {
        backgroundColor: 'transparent',
        padding: 0,
      },
    },
    '& a': {
      color: theme.palette.primary.main,
      textDecoration: 'none',
      '&:hover': {
        textDecoration: 'underline',
      },
    },
    '& table': {
      borderCollapse: 'collapse',
      width: '100%',
      marginBottom: theme.spacing(2),
    },
    '& th, & td': {
      border: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(1),
      textAlign: 'left' as const,
    },
    '& th': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? 'rgba(255, 255, 255, 0.05)'
          : 'rgba(0, 0, 0, 0.03)',
      fontWeight: 600,
    },
    '& blockquote': {
      borderLeft: `4px solid ${theme.palette.primary.main}`,
      margin: theme.spacing(2, 0),
      paddingLeft: theme.spacing(2),
      color: theme.palette.text.secondary,
    },
    '& img': {
      maxWidth: '100%',
      height: 'auto',
    },
  },

  breadcrumbs: {
    marginBottom: theme.spacing(2),
  },
  breadcrumbLink: {
    color: theme.palette.primary.main,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  breadcrumbCurrent: {
    color: theme.palette.text.primary,
    fontWeight: 500,
  },

  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
  refreshing: {
    animation: '$spin 1s linear infinite',
  },

  repositoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: theme.spacing(0.25, 1.25),
    borderRadius: 50,
    fontSize: '0.7rem',
    fontWeight: 450,
    textTransform: 'capitalize' as const,
    marginLeft: theme.spacing(1),
    flexShrink: 0,
    border: `1px solid ${theme.palette.type === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
  },
  badgeCertified: {
    backgroundColor: 'rgba(65, 253, 71, 0.15)',
    color: theme.palette.text.primary,
  },
  badgeValidated: {
    backgroundColor: 'rgba(65, 253, 71, 0.15)',
    color: theme.palette.text.primary,
  },
  badgeCommunity: {
    backgroundColor:
      theme.palette.type === 'dark'
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(0, 0, 0, 0.06)',
    color: theme.palette.text.secondary,
  },

  titleWithBadge: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap' as const,
    minWidth: 0,
  },
  cardTitleText: {
    fontWeight: 600,
    fontSize: '1rem',
    color: theme.palette.primary.main,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  detailsTitleText: {
    fontWeight: 700,
    fontSize: '1.75rem',
  },
}));
