import {
  Box,
  IconButton,
  MenuItem,
  Select,
  Typography,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import { PAGE_SIZE_OPTIONS, resolvePageLimit } from './constants';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing(3),
    paddingTop: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.divider}`,
    gap: theme.spacing(2),
    flexWrap: 'wrap',
  },
  summary: {
    color: theme.palette.text.secondary,
    fontSize: '0.8125rem',
    letterSpacing: '0.01em',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  pageSize: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
  },
  pageSizeLabel: {
    color: theme.palette.text.secondary,
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
  },
  pageSizeSelect: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: theme.palette.text.primary,
    minWidth: 40,
    '& .MuiSelect-select': {
      paddingTop: 2,
      paddingBottom: 2,
      paddingLeft: 4,
      paddingRight: 24,
    },
    '&:before, &:after': {
      display: 'none',
    },
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    minHeight: 20,
    backgroundColor: theme.palette.divider,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.25),
  },
  navButton: {
    padding: 6,
  },
  pageIndicator: {
    fontSize: '0.8125rem',
    color: theme.palette.text.secondary,
    minWidth: 52,
    textAlign: 'center',
    userSelect: 'none',
    fontVariantNumeric: 'tabular-nums',
  },
}));

type TemplatesPaginationProps = {
  totalCount: number;
  pageLimit: number;
  page: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (offset: number) => void;
  onPageSizeChange: (limit: number) => void;
};

export const TemplatesPagination = ({
  totalCount,
  pageLimit,
  page,
  totalPages,
  startIndex,
  endIndex,
  onPageChange,
  onPageSizeChange,
}: TemplatesPaginationProps) => {
  const classes = useStyles();
  const selectedPageSize = resolvePageLimit(pageLimit);
  const singlePage = totalPages <= 1;

  return (
    <Box className={classes.root} data-testid="templates-pagination">
      <Typography className={classes.summary} component="span">
        {totalCount === 1
          ? '1 template'
          : `${startIndex}–${endIndex} of ${totalCount} templates`}
      </Typography>

      <Box className={classes.controls}>
        <Box className={classes.pageSize}>
          <Typography
            className={classes.pageSizeLabel}
            component="span"
            id="templates-page-size-label"
          >
            Per page
          </Typography>
          <Select
            value={selectedPageSize}
            onChange={event => {
              onPageSizeChange(Number(event.target.value));
            }}
            disableUnderline
            className={classes.pageSizeSelect}
            renderValue={String}
            inputProps={{
              'aria-label': 'Templates per page',
              'aria-labelledby': 'templates-page-size-label',
            }}
            data-testid="templates-page-size-select"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <MenuItem key={size} value={size} dense>
                {size}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box className={classes.divider} aria-hidden />
        <Box className={classes.nav}>
          <IconButton
            size="small"
            className={classes.navButton}
            disabled={singlePage || page <= 0}
            onClick={() => onPageChange((page - 1) * pageLimit)}
            aria-label="Previous page"
          >
            <NavigateBeforeIcon fontSize="small" />
          </IconButton>
          <Typography className={classes.pageIndicator} component="span">
            {page + 1} / {totalPages}
          </Typography>
          <IconButton
            size="small"
            className={classes.navButton}
            disabled={singlePage || page + 1 >= totalPages}
            onClick={() => onPageChange((page + 1) * pageLimit)}
            aria-label="Next page"
          >
            <NavigateNextIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};
