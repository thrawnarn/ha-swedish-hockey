#!/bin/sh
# Install dependencies outside the repository and link them in.
#
# The repo usually lives inside a Home Assistant config folder, and everything
# there goes into every backup -- node_modules included. npm will not install
# through a symlink (it replaces it with a real folder), so install into a
# cache folder and link to it. CI and ordinary checkouts elsewhere just run
# `npm ci` as usual.
set -e
here=$(cd "$(dirname "$0")" && pwd)
cache=${HOCKEY_CARD_DEPS:-$HOME/.cache/swedish-hockey-frontend}
mkdir -p "$cache"
cp "$here/package.json" "$cache/"
[ -f "$here/package-lock.json" ] && cp "$here/package-lock.json" "$cache/"
(cd "$cache" && npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund)
cp "$cache/package-lock.json" "$here/"
rm -rf "$here/node_modules"
ln -s "$cache/node_modules" "$here/node_modules"
echo "node_modules -> $cache/node_modules"
