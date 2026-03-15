import { makeStyles } from '@material-ui/core/styles';

export const useSharedStyles = makeStyles(theme => ({
  // Empty state styles
  emptyStateContainer: {
    width: '100%',
    minHeight: '70vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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

  // Sync dialog styles
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
  syncButton: {
    textTransform: 'none',
    fontWeight: 500,
  },
}));
