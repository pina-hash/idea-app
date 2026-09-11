#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stamp=node_modules/.codex-package-lock.sha256
current="$(sha256sum package-lock.json | awk '{print $1}')"
previous="$(cat "$stamp" 2>/dev/null || true)"
if [[ "$current" != "$previous" ]]; then
  npm ci
  mkdir -p node_modules
  printf '%s\n' "$current" >"$stamp"
  echo "codex-maintenance: package-lock.json changed; dependencies refreshed"
else
  echo "codex-maintenance: package-lock.json unchanged; npm ci skipped"
fi
