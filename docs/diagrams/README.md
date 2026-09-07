# Architecture diagrams

Mermaid source (`.mmd`) for Ansible Backstage plugin architecture and runtime flows.

| Directory                        | Purpose                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| [`architecture/`](architecture/) | How plugins and modules are organized - dependencies, registration, and integration points |
| [`sequence/`](sequence/)         | How components interact over time - request flows, scheduling, and external API calls      |

Diagrams use [Red Hat Text](https://github.com/RedHatOfficial/RedHatFont) via Mermaid `%%{init}%%` theme variables. Render with the [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli) (`mmdc`):

```bash
mmdc -i docs/diagrams/<subdir>/<name>.mmd -o /tmp/<name>.png -w 1200 --backgroundColor white
```

**Preview note:** Some lightweight `.mmd` previewers only support `flowchart` and `stateDiagram-v2`, not `sequenceDiagram`. Use `mmdc` or [Mermaid Live Editor](https://mermaid.live) for sequence diagrams.
