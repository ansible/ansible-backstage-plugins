/*
 * Copyright Red Hat
 *
 * Optional catalog row addon slot — renders factory plugin UI via ADR-010 extensions API.
 */

import { Entity } from '@backstage/catalog-model';
import { useGitRepositoriesExtensions } from './useGitRepositoriesExtensions';

export interface CatalogRowAddonSlotProps {
  entity: Entity;
  projectDetailPath?: string;
}

/**
 * Renders optional Git Repos catalog row addons registered by factory plugins.
 * Returns null when no extensions are registered (ADR-010 zero footprint).
 */
export const CatalogRowAddonSlot = ({
  entity,
  projectDetailPath,
}: CatalogRowAddonSlotProps) => {
  const extensionsApi = useGitRepositoriesExtensions();
  const slots = [...extensionsApi.getCatalogRowSlots()].sort(
    (a, b) => a.order - b.order,
  );

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
