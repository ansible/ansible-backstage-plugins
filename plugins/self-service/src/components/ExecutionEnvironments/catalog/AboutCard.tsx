import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  IconButton,
  Button,
} from '@material-ui/core';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import DescriptionOutlinedIcon from '@material-ui/icons/DescriptionOutlined';
import GitHubIcon from '@material-ui/icons/GitHub';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import EditIcon from '@material-ui/icons/Edit';
import { Entity, ANNOTATION_EDIT_URL } from '@backstage/catalog-model';

const useStyles = makeStyles(() => ({
  tagButton: {
    borderRadius: 8,
    borderColor: '#D3D3D3',
    textTransform: 'none',
  },
  rotate: {
    animation: '$spin 1s linear',
  },
  '@keyframes spin': {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
}));

interface AboutCardProps {
  entity: Entity;
  ownerName: string | null;
  isRefreshing: boolean;
  isDownloadExperience: boolean;
  onRefresh: () => void;
  onViewTechdocs: () => void;
  onOpenSourceLocation: () => void;
}

export const AboutCard: React.FC<AboutCardProps> = ({
  entity,
  ownerName,
  isRefreshing,
  isDownloadExperience,
  onRefresh,
  onViewTechdocs,
  onOpenSourceLocation,
}) => {
  const classes = useStyles();
  const theme = useTheme();

  return (
    <Card
      variant="outlined"
      style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography
            variant="h6"
            style={{
              fontWeight: 'bold',
              fontSize: '1.5rem',
              marginLeft: 10,
            }}
          >
            About
          </Typography>
          {!isDownloadExperience && (
            <Box display="flex" alignItems="center">
              <IconButton size="small" onClick={onRefresh}>
                <AutorenewIcon
                  className={isRefreshing ? classes.rotate : ''}
                  style={{ color: '#757575' }}
                />
              </IconButton>{' '}
              <IconButton size="small">
                <a
                  href={entity?.metadata?.annotations?.[ANNOTATION_EDIT_URL]}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <EditIcon style={{ color: theme.palette.primary.main }} />
                </a>
              </IconButton>
            </Box>
          )}
        </Box>
        {/* Top Actions (View Techdocs / Source) */}
        {!isDownloadExperience && (
          <Box
            display="flex"
            justifyContent="space-around"
            alignItems="center"
            textAlign="center"
            mt={2}
            mb={2}
          >
            <Box
              onClick={onViewTechdocs}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 120,
              }}
            >
              <DescriptionOutlinedIcon
                style={{
                  color: theme.palette.primary.main,
                  fontSize: 30,
                }}
              />
              <Typography
                variant="body2"
                style={{
                  color: theme.palette.primary.main,
                  fontWeight: 600,
                  marginTop: 6,
                }}
              >
                VIEW <br /> TECHDOCS
              </Typography>
            </Box>

            <Box
              onClick={onOpenSourceLocation}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 120,
              }}
            >
              <GitHubIcon
                style={{
                  color: theme.palette.primary.main,
                  fontSize: 30,
                }}
              />
              <Typography
                variant="body2"
                style={{
                  color: theme.palette.primary.main,
                  fontWeight: 600,
                  marginTop: 6,
                }}
              >
                VIEW <br /> SOURCE
              </Typography>
            </Box>
          </Box>
        )}
        <Divider style={{ margin: '12px -16px 12px' }} />
        {/* Details */}
        <Box>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            DESCRIPTION
          </Typography>
          <Typography variant="body2">
            {entity?.metadata?.description ??
              entity?.metadata?.title ??
              'No description available.'}
          </Typography>
        </Box>
        <Box display="flex" flexDirection="column" gridGap={4} marginTop={2}>
          <Box>
            <Typography
              variant="caption"
              style={{ color: 'gray', fontWeight: 600 }}
            >
              OWNER
            </Typography>{' '}
            <Typography variant="body2">{ownerName}</Typography>
          </Box>
          <Box marginTop={2}>
            <Typography
              variant="caption"
              style={{ color: 'gray', fontWeight: 600 }}
            >
              TYPE
            </Typography>
            <Typography variant="body2" style={{ fontWeight: 600 }}>
              {(entity?.spec?.type as string) ??
                (entity?.metadata?.namespace as string) ??
                'Unknown'}
            </Typography>
          </Box>
        </Box>

        <Box marginTop={2}>
          <Typography
            variant="caption"
            style={{ color: 'gray', fontWeight: 600 }}
          >
            TAGS
          </Typography>

          <Box display="flex" gridGap={8} marginTop={1} flexWrap="wrap">
            {Array.isArray(entity?.metadata?.tags) &&
            entity.metadata?.tags?.length > 0 ? (
              entity.metadata?.tags?.map((t: string) => (
                <Button
                  variant="outlined"
                  size="small"
                  key={t}
                  className={classes.tagButton}
                  style={{
                    textTransform: 'none',
                    borderRadius: 8,
                    borderColor: '#D3D3D3',
                  }}
                >
                  {t}
                </Button>
              ))
            ) : (
              <Typography variant="body2" color="textSecondary">
                No tags
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
