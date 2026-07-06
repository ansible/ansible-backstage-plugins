/*
 * Copyright Red Hat
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content, Header, Page, Progress } from '@backstage/core-components';

/** Legacy /apme route — redirects to Git Repositories fleet Quality tab (ADR-010). */
export const ApmePage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/self-service/repositories/quality', { replace: true });
  }, [navigate]);

  return (
    <Page themeId="home">
      <Header title="Content Quality" />
      <Content>
        <Progress />
      </Content>
    </Page>
  );
};
