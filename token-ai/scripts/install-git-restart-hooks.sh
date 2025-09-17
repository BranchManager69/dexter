#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

mkdir -p "$HOOKS_DIR"

cat > "$HOOKS_DIR/post-merge" << 'EOF'
#!/usr/bin/env bash
# Auto-trigger systemd .path watchers by touching watched dirs/files after merges
set -e
ROOT="$(git rev-parse --show-toplevel)"
touch -m "$ROOT/alpha/dexter-mcp" || true
touch -m "$ROOT/alpha/dexter-mcp/tools" || true
touch -m "$ROOT/alpha/dexter-mcp/common.mjs" || true
touch -m "$ROOT/alpha/dexter-mcp/http-server-oauth.mjs" || true
touch -m "$ROOT/token-ai/server" || true
touch -m "$ROOT/token-ai/core" || true
touch -m "$ROOT/token-ai/server.js" || true
exit 0
EOF

cat > "$HOOKS_DIR/post-checkout" << 'EOF'
#!/usr/bin/env bash
# Auto-trigger systemd .path watchers by touching watched dirs/files after checkout/switch
set -e
ROOT="$(git rev-parse --show-toplevel)"
touch -m "$ROOT/alpha/dexter-mcp" || true
touch -m "$ROOT/alpha/dexter-mcp/tools" || true
touch -m "$ROOT/alpha/dexter-mcp/common.mjs" || true
touch -m "$ROOT/alpha/dexter-mcp/http-server-oauth.mjs" || true
touch -m "$ROOT/token-ai/server" || true
touch -m "$ROOT/token-ai/core" || true
touch -m "$ROOT/token-ai/server.js" || true
exit 0
EOF

cat > "$HOOKS_DIR/post-rewrite" << 'EOF'
#!/usr/bin/env bash
# Handle rebase/amend
set -e
ROOT="$(git rev-parse --show-toplevel)"
touch -m "$ROOT/alpha/dexter-mcp" || true
touch -m "$ROOT/alpha/dexter-mcp/tools" || true
touch -m "$ROOT/alpha/dexter-mcp/common.mjs" || true
touch -m "$ROOT/alpha/dexter-mcp/http-server-oauth.mjs" || true
touch -m "$ROOT/token-ai/server" || true
touch -m "$ROOT/token-ai/core" || true
touch -m "$ROOT/token-ai/server.js" || true
exit 0
EOF

chmod +x "$HOOKS_DIR/post-merge" "$HOOKS_DIR/post-checkout" "$HOOKS_DIR/post-rewrite"

echo "Installed git hooks to trigger dexter restarts via systemd path watchers."
echo "Hooks: post-merge, post-checkout, post-rewrite"
