export interface SummaryFieldCredential {
  id: number;
  name: string;
  description: string;
  kind: string;
  cloud: boolean;
}

export interface SummaryFieldObjectRole {
  description: string;
  name: string;
  id: number;
  user_only?: boolean;
}

/**
 * A single instance-group record from the AAP Controller API.
 * List endpoints wrap these in {@link InstanceGroupListResponse}.
 */
export interface InstanceGroup {
  id: number;
  name: string;
  description?: string;
  consumed_capacity: number;
  max_concurrent_jobs: number;
  max_forks: number;
  pod_spec_override: string;
  percent_capacity_remaining: number;
  is_container_group: boolean;
  policy_instance_list: string[];
  capacity: number | null;
  summary_fields: {
    credential?: SummaryFieldCredential;
    object_roles: {
      admin_role: SummaryFieldObjectRole;
      update_role: SummaryFieldObjectRole;
      adhoc_role: SummaryFieldObjectRole;
      use_role: SummaryFieldObjectRole;
      read_role: SummaryFieldObjectRole;
    };
    user_capabilities: {
      edit: boolean;
      delete: boolean;
    };
  };
}

/** Paginated list response for the instance-groups collection endpoint. */
export type InstanceGroupListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: InstanceGroup[];
};
