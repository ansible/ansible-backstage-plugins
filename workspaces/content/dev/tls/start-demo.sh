#!/usr/bin/env bash
# Bring up the TLS-transport side of the AAP-96688 demo.
#
#   1. demo certificates (trusted CA + untrusted CA)
#   2. a TLS-terminating proxy over a local plain-HTTP registry:
#        :8443 trusted certificate, :8444 untrusted certificate
#   3. the app-config snippet for the three demo registries
#
# The registry itself is a prerequisite, not something this script owns (this
# repo does not bundle a local Quay): any plain-HTTP registry reachable on
# UPSTREAM_REGISTRY works — the standalone automation-content-plugins repo's
# dev/quay, or a disposable `registry:2`:
#
#   podman run -d -p 8080:5000 --name demo-registry docker.io/library/registry:2
#
# Seed it so discovery finds something:
#
#   podman pull quay.io/ansible/creator-ee:latest
#   podman tag quay.io/ansible/creator-ee:latest localhost:8080/demo/network-ee:dev
#   podman push localhost:8080/demo/network-ee:dev
#
# Then configure the three registries (step 3 prints the snippet), start the
# dev portal with `yarn start`, and run the demo runner:
#
#   node workspaces/content/tools/demo-registry-tls.mjs --token <backstage-jwt>
#
# See dev/tls/README.md for the full runbook.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"            # workspaces/content/dev/tls
WORKSPACE="$(cd "$HERE/../.." && pwd)"           # workspaces/content
UPSTREAM_REGISTRY="${UPSTREAM_REGISTRY:-http://127.0.0.1:8080}"

# 1. Certificates ------------------------------------------------------------
if [ ! -f "$HERE/certs/demo-trusted-server.pem" ]; then
  echo "=== Generating demo certificates"
  python3 "$HERE/generate-certs.py"
fi

# 2. TLS proxy ---------------------------------------------------------------
if [ -f "$HERE/proxy.pid" ] && kill -0 "$(cat "$HERE/proxy.pid")" 2>/dev/null; then
  echo "=== TLS proxy already running (pid $(cat "$HERE/proxy.pid"))"
else
  echo "=== Starting TLS proxy ($UPSTREAM_REGISTRY behind :8443 trusted / :8444 untrusted)"
  nohup node "$HERE/tls-proxy.mjs" --upstream "$UPSTREAM_REGISTRY" \
    > "$HERE/proxy.log" 2>&1 &
  echo $! > "$HERE/proxy.pid"
  sleep 1
fi

# 3. Point at it -------------------------------------------------------------
CA="$HERE/certs/demo-ca.pem"
echo
echo "=== Up and running. Next steps:"
echo
echo "1. The portal must run on the host (not a container) for these loopback"
echo "   URLs; from inside a container use the host's IP instead — the generated"
echo "   certificates already include it as a SAN."
echo
echo "2. Add the three demo registries to app-config.local.yaml (gitignored):"
echo
echo "   catalog:"
echo "     providers:"
echo "       automationContent:"
echo "         owner: group:default/ansible"
echo "         registries:"
echo "           - name: local-quay"
echo "             url: $UPSTREAM_REGISTRY"
echo "             repositories: [demo/network-ee]"
echo "             insecure: true   # the explicit opt-out: plain HTTP, no verification"
echo "           - name: local-quay-tls"
echo "             url: https://127.0.0.1:8443"
echo "             repositories: [demo/network-ee]"
echo "             caFile: $CA"
echo "           - name: local-quay-untrusted"
echo "             url: https://127.0.0.1:8444"
echo "             repositories: [demo/network-ee]"
echo
echo "3. Start the dev portal:  yarn start"
echo
echo "4. Run the demo (mutating routes need a token — sign in to the portal in a"
echo "   browser and copy it):"
echo
echo "   node $WORKSPACE/tools/demo-registry-tls.mjs --token <backstage-jwt>"
echo
echo "   Browser view: http://localhost:3000/automation-content"
