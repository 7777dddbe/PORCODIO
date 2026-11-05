#!/usr/bin/env bash
# Crea dist/index.html: gioco in un solo file (Three.js resta caricato da CDN).
set -e
cd "$(dirname "$0")"
mkdir -p dist
npx --yes esbuild src/main.js --bundle --format=esm --minify --target=es2020 --external:three --external:'three/addons/*' --outfile=dist/game.js
node tools/inline.mjs
