#!/usr/bin/env bash
set -euo pipefail

cat \
  src/core.js \
  src/modules/pz.js \
  src/modules/rune.js \
  src/ui/panel.js \
  src/main.js \
  > pz-bot.js
