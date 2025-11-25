import { useApi } from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  useStarredEntities,
} from '@backstage/plugin-catalog-react';
import { Typography, makeStyles, withStyles } from '@material-ui/core';
import Star from '@material-ui/icons/Star';
import useAsync from 'react-use/esm/useAsync';
import { InfoCard, Link } from '@backstage/core-components';

const useStyles = makeStyles(theme => ({
  flex: {
    display: 'flex',
  },
  star_icon: {
    float: 'left',
    marginRight: '10px',
  },
  kind: {
    color: theme.palette.type === 'light' ? '#757575' : 'currentColor',
  },
}));

// type Props = React.ComponentType<{}> & Element

export const YellowStar: React.ComponentType = withStyles({
  root: {
    color: '#f3ba37',
  },
})(Star);

export const Favourites = () => {
  const classes = useStyles();
  const catalogApi = useApi(catalogApiRef);
  const {
    value: entities,
    loading,
    error,
  } = useAsync(() => {
    return catalogApi.getEntities({ filter: [{ 'metadata.tags': 'ansible' }] });
  }, []);
  const { isStarredEntity } = useStarredEntities();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  const starredEntities = entities?.items.filter(entity =>
    isStarredEntity(entity),
  );

  const getStarredList = () =>
    starredEntities?.map((entity, index) => (
      <li key={index} style={{ marginBottom: '22px' }}>
        <Typography variant="body1" className={classes.flex}>
          <Typography component="span" className={classes.star_icon}>
            <YellowStar />
          </Typography>
          <Typography component="span">
            <Typography component="span">
              <Link
                to={`${
                  entity.kind === 'Template'
                    ? `../../../create/templates/default/${entity.metadata.name}`
                    : `../../../catalog/default/component/${entity.metadata.name}`
                }`}
              >
                {entity.metadata.name}
              </Link>
              <br />
            </Typography>
            <Typography
              variant="subtitle1"
              component="span"
              className={classes.kind}
            >
              {entity.kind}
            </Typography>
          </Typography>
        </Typography>
      </li>
    ));

  return (
    <InfoCard title="Starred Ansible Items">
      {starredEntities && starredEntities?.length > 0 ? (
        <ul
          style={{ listStyle: 'none', paddingLeft: 10 }}
          data-testid="starred-list"
        >
          {getStarredList()}
        </ul>
      ) : (
        <Typography className={classes.kind} data-testid="no-starred-list">
          Click the star beside an Ansible entity name to add it to this list!
        </Typography>
      )}
    </InfoCard>
  );
};
