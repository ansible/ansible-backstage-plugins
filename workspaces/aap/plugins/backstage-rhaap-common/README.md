# @ansible/backstage-rhaap-common

Welcome to the common package for the backstage-rhaap plugin!

_This plugin was created through the Backstage CLI_

## Legacy Git Repository frontend imports

The `./gitRepositoriesCatalog` and `./gitRepositoriesExtensions` entry points
forward to `@ansible/portal-scaffolder-react`. A frontend plugin importing either
legacy entry point must declare that library as a runtime dependency. APME and
Portal-scaffolder declare it directly; backend-only consumers do not need it.
The optional peer keeps frontend code out of backend-only installations; it
does not make the library optional when loading these frontend entry points.

Build or obtain the legacy package, the content frontend library and affected
frontend plugins from the same repository revision, and deploy them together.
Earlier `portal-scaffolder-react` artifacts with version `0.1.0` do not export
these Git Repository subpaths. Package versions are unchanged in this migration,
so a matching version number alone does not establish artifact compatibility.
External consumers using the legacy frontend entry points must also install the
matching content frontend library.
