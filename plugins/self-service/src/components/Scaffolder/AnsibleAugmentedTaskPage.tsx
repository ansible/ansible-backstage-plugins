/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { ComponentType, ReactNode } from 'react';
import type { ScaffolderTaskOutput } from '@backstage/plugin-scaffolder-react';
import { TaskPage } from '@backstage/plugin-scaffolder';
import { WorkflowJobTaskSection } from '../RunTask/WorkflowJobTaskSection';

export type AnsibleAugmentedTaskPageProps = {
  children?: ReactNode;
  TemplateOutputsComponent?: ComponentType<{
    output?: ScaffolderTaskOutput;
  }>;
};

/**
 * Wraps the stock scaffolder task page so Ansible workflow templates show the
 * live workflow panel on **`/create/tasks/:taskId`** as well as self-service.
 */
export function AnsibleAugmentedTaskPage(props: AnsibleAugmentedTaskPageProps) {
  return (
    <>
      <WorkflowJobTaskSection />
      <TaskPage {...props} />
    </>
  );
}
