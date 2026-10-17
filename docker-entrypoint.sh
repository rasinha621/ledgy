#!/bin/sh
# Make sure the data folder (often a bind mount owned by root) is writable, then drop root.
set -e
PUID="${PUID:-1000}"; PGID="${PGID:-1000}"
mkdir -p "$DATA_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR"
exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
