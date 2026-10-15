import { makeStyles } from '@material-ui/core/styles';
import { WarningPanel, Content } from '@backstage/core-components';

const useStyles = makeStyles(() => ({
  warningPanel: {
    marginTop: 16,
    marginBottom: 24,
    height: '80vh',
    borderRadius: 15,
  },
}));

export const EntityNotFound: React.FC = () => {
  const classes = useStyles();

  return (
    <div>
      {' '}
      <Content className={classes.warningPanel}>
        <WarningPanel title="Entity not found">
          There is no entity with the requested kind, namespace, and name.
        </WarningPanel>
      </Content>
    </div>
  );
};
