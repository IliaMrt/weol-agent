#!/bin/sh
set -e

# Том ./data с хоста часто принадлежит root — поправим под pwuser (uid 1000).
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R pwuser:pwuser /app/data
  exec gosu pwuser "$@"
fi

exec "$@"
