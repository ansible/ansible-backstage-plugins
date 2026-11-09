# Ansible collection content type

Backend adapter for OCI collection artifacts. Registered by the content catalog module;
no separate configuration is required. Install as a workspace dependency and register
`new AnsibleCollectionAdapter()` in a `ContentTypeRegistry` to use independently.

For AAP-94357 research, identification requires the exact local fixture artifact type
`application/vnd.ansible.fixture.collection.v1+json`, not a repository naming convention.
Enumeration reads `collection_info` from root `MANIFEST.json` in a single tar+gzip
layer. The item retains authors, tags, dependencies and links in detail. This does
not claim to introspect collection plugin documentation. Compressed and expanded
layers are limited to 16 MiB; unavailable or invalid metadata remains honestly unknown.

Metadata documents are limited to 1 MiB. Normalized metadata has a conservative
2 MiB JSON byte budget, 10,000 nodes and depth 32, checked before redaction or
persistence without serializing the document.
