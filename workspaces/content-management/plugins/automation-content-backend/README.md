# Automation Content backend

Persists registry artifacts and their indexed Ansible content for the Automation
Content frontend. Register the backend plugin in the host backend; registry
connections and content types are configured by the host's content-management
integration. See the [workspace documentation](../../README.md).

## Repository sync

`POST /api/automation-content/artifacts/{ref}/sync` requires a user identity and
`ansible.content.sync`. The indexed reference selects one configured registry
and repository. Sync enumerates all image tags, HEADs each, reads manifests and
configs, then reconciles new, moved and deleted tags atomically. Signature and
attachment tags are not indexed as images. Other repositories and registry-wide
freshness are unchanged; `latest` is not required.

The 202 result reports `completed` or `failed` and, on completion, counts added,
removed and moved tags and refreshed digests. Its reference is the original digest
if it survives, otherwise the digest tagged `latest`, another remaining digest,
or the original reference if no images remain (`removed: true`). `tag: latest`
is a legacy compatibility field, not the scan scope. Missing or out-of-scope
indexed references return a structured 404 with code `ARTIFACT_NOT_FOUND`.

Core manifest/config read failures preserve the previous index. Invalid metadata
retains existing same-digest rows. Optional inventory may remain unknown;
previously verified inventory can be retained for the same digest, never copied
to a different digest. Header and registry sync actions remain registry-wide.
