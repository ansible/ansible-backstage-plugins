# Sequence diagrams

Runtime interaction flows between Portal UI, Backstage backend modules, and Ansible Automation Platform.

| File                                                                             | Description                                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`pah-catalog-sync-sequence.mmd`](pah-catalog-sync-sequence.mmd)                 | Scheduled `PAHCollectionProvider.run()` — fetch collections from Private Automation Hub, parse entities, apply to catalog     |
| [`pah-catalog-sync-trigger-sequence.mmd`](pah-catalog-sync-trigger-sequence.mmd) | Manual trigger via `POST /ansible/sync/from-aap/content` — superuser auth, `Promise.all` provider triggers, scheduler handoff |
| [`scaffolder-job-launch-sequence.mmd`](scaffolder-job-launch-sequence.mmd)       | Scaffolder path from self-service UI through `aapLaunchJobTemplate` to AAP job polling                                        |
