import { useEffect, useState } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Page, Header, Content } from '@backstage/core-components';
import { CircularProgress } from '@material-ui/core';
import { EETabs } from './TabviewPage';


export const EEPage = () => {
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);
  const [isSuperuser, setIsSuperuser] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkSuperuser = async () => {
      try {
        const identity = await identityApi.getBackstageIdentity();
        const userEntityRef = identity.userEntityRef;

        if (userEntityRef) {
          try {
            const userEntity = await catalogApi.getEntityByRef(userEntityRef);
            const isSuperuserAnnotation =
              userEntity?.metadata?.annotations?.['aap.platform/is_superuser'];
            const isSuperuserValue = isSuperuserAnnotation === 'true';
            setIsSuperuser(isSuperuserValue);
          } catch {
            setIsSuperuser(false);
          }
        } else {
          setIsSuperuser(false);
        }
      } catch {
        setIsSuperuser(false);
      } finally {
        setLoading(false);
      }
    };

    checkSuperuser();
  }, [identityApi, catalogApi]);


  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <CircularProgress />
        </Content>
      </Page>
    );
  }

  if (!isSuperuser) {
    return (
      <Page themeId="tool">
        <Header title="Access Denied" />
        <Content>
          <p>You do not have permission to access this page.</p>
        </Content>
      </Page>
    );
  }

  return <EETabs />;
};

