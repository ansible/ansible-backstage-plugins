import { Box, Card, CardContent, Typography, Divider } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import GetAppIcon from '@material-ui/icons/GetApp';

const useStyles = makeStyles(() => ({
  linkText: {
    color: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    '&:hover': {
      textDecoration: 'underline',
      transform: 'scale(1.03)',
    },
  },
}));

interface LinksCardProps {
  onDownloadArchive: () => void;
}

export const LinksCard: React.FC<LinksCardProps> = ({ onDownloadArchive }) => {
  const classes = useStyles();

  const links = [
    {
      icon: <GetAppIcon />,
      text: 'Download EE files',
      onClick: onDownloadArchive,
    },
  ];

  return (
    <Card
      variant="outlined"
      style={{ borderRadius: 16, borderColor: '#D3D3D3' }}
    >
      <CardContent>
        <Typography
          variant="h6"
          style={{
            fontWeight: 'bold',
            fontSize: '1.5rem',
            margin: '6px 0 13px 10px',
          }}
        >
          Links
        </Typography>
        <Divider style={{ margin: '0 -16px 12px' }} />

        {links.map(item => (
          <Box
            key={item.text}
            display="flex"
            alignItems="center"
            gridGap={12}
            onClick={item.onClick}
            style={{
              marginLeft: 10,
              marginBottom: 10,
              cursor: 'pointer',
            }}
          >
            {item.icon}
            <Typography variant="body1" className={classes.linkText}>
              {item.text}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
};
