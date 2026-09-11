#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat >.env <<'EOF'
PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co
PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key
EOF

node_major="$(node -p 'process.versions.node.split(`.`)[0]')"
if (( node_major < 24 )) && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # The setup phase has network when the image has not cached CI's pinned Node yet.
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || nvm install 24
  nvm use 24
  node_major="$(node -p 'process.versions.node.split(`.`)[0]')"
fi
if (( node_major < 24 )); then
  echo "codex-setup: Node 24 is required (CI's pinned version); found $(node --version)" >&2
  exit 1
fi

npm ci
npx --yes playwright@1.56.1 install chromium
printf '%s\n' "codex-setup: Node $(node --version), dependencies, Chromium, and placeholder .env are ready"
