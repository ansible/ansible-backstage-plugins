# Ansible skill content type

Backend adapter for OCI skill artifacts. Registered by the content catalog module;
no separate configuration is required. Install as a workspace dependency and register
`new AnsibleSkillAdapter()` in a `ContentTypeRegistry` to use independently.

For AAP-94357 research, identification requires the exact local fixture artifact type
`application/vnd.ansible.fixture.skill.v1+json`, not a repository naming convention.
Enumeration reads YAML frontmatter from root `SKILL.md` in a single tar+gzip layer.
Unknown frontmatter fields are preserved in item detail. Compressed and expanded
layers are limited to 16 MiB; unavailable or invalid metadata remains honestly unknown.

Metadata documents are limited to 1 MiB. YAML aliases are disabled. Normalized
metadata has a conservative 2 MiB JSON byte budget, 10,000 nodes and depth 32,
checked before redaction or persistence without serializing the document.
