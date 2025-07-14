import { Card, CardActions, CardContent, CardHeader } from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';

export const SkeletonLoader = () => {
  return (
    <Card style={{ width: '30%', height: '100%', marginBottom: '100px' }}>
      <CardHeader
        title={<Skeleton variant="text" width="100%" height="100%" />}
        subheader={<Skeleton variant="text" width="100%" height="100%" />}
      />
      <CardContent>
        <Skeleton variant="text" width="100%" height="100%" />
        <Skeleton variant="text" width="100%" height="100%" />
        <Skeleton variant="rect" width="100%" height="190px" />
        <Skeleton variant="rect" width="100%" height="190px" />
      </CardContent>
      <CardActions
        disableSpacing
        style={{
          marginLeft: 1,
          marginRight: 1,
          justifyContent: 'space-between',
        }}
      >
        <Skeleton variant="circle" width="20px" height="20px" />
        <Skeleton
          variant="text"
          width="64px"
          height="50px"
          style={{ padding: '3px 9px', borderRadius: '16px' }}
        />
      </CardActions>
    </Card>
  );
};
