# @ansible/automation-content-common

## Legacy content contract migration

The `./permissions` entry owns the existing Git Repository and collection read
permissions alongside the existing EE grants. IDs and basic permission shapes
remain unchanged. `./scm` exposes the existing SCM authentication error code;
`./versions` exposes the existing content version comparison helper.
Frontend repository extension and cache-control APIs are shared through the
content-owned `@ansible/portal-scaffolder-react` library's dedicated subpaths.
AAP template/history permissions remain with `@ansible/aap-common`.
