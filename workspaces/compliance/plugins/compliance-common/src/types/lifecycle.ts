/**
 * Profile Lifecycle — tracks connection state and versioning.
 *
 * Profiles are never deleted. They transition between connected and
 * disconnected states. All historical data (findings, scans, snapshots)
 * is preserved for audit regardless of lifecycle state.
 */

export type ProfileConnectionStatus = 'connected' | 'disconnected';

/** Version record stored when a profile is installed or upgraded. */
export interface ProfileVersion {
  version: string;
  installedAt: string;
  previousVersion?: string;
}

/** Extended profile metadata for lifecycle tracking. */
export interface ProfileLifecycleState {
  connectionStatus: ProfileConnectionStatus;
  currentVersion: ProfileVersion;
  versionHistory: ProfileVersion[];
  disconnectedAt?: string;
  disconnectedBy?: string;
}
