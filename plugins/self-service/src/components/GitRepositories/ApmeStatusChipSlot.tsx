/*
 * Copyright Red Hat
 *
 * Optional catalog row addon slot — renders factory plugin UI via ADR-010 extensions API.
 */

import { Entity } from '@backstage/catalog-model';
import { useApi } from '@backstage/core-plugin-api';
import { gitRepositoriesExtensionsApiRef } from '@ansible/backstage-rhaap-common/gitRepositoriesExtensions';

export interface ApmeStatusChipSlotProps {
  entity: Entity;
  projectDetailPath?: string;
}

/**
 * Renders optional Git Repos catalog row addons registered by factory plugins.
 * Returns null when no extensions are registered (ADR-010 zero footprint).
 */
export const ApmeStatusChipSlot = ({
  entity,
  projectDetailPath,
}: ApmeStatusChipSlotProps) => {
  const extensionsApi = useApi(gitRepositoriesExtensionsApiRef);
  const slots = extensionsApi.getCatalogRowSlots();

  if (slots.length === 0) {
    return null;
  }

  return (
    <>
      {slots.map(slot => (
        <span key={slot.id}>{slot.render({ entity, projectDetailPath })}</span>
      ))}
    </>
  );
};
