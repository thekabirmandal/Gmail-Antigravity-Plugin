#!/bin/bash
set -e

# Detect node executable if not in PATH
if ! command -v node >/dev/null 2>&1; then
  # Try nvm paths
  for nvm_dir in "$HOME/.nvm/versions/node"/*; do
    if [ -x "$nvm_dir/bin/node" ]; then
      export PATH="$nvm_dir/bin:$PATH"
      break
    fi
  done
  # Try homebrew & standard paths
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$DIR/src/index.mjs" "$@"
