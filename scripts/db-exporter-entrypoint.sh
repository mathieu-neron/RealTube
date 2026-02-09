#!/bin/sh
# Wrapper entrypoint for db-exporter that reads the Docker secret
# and exports PGPASSWORD before running the export loop.
set -e

# Read password from Docker secret file, fall back to PGPASSWORD env var
SECRET_FILE="/run/secrets/postgres_password"
if [ -f "$SECRET_FILE" ]; then
    PGPASSWORD=$(cat "$SECRET_FILE" | tr -d '[:space:]')
    export PGPASSWORD
fi

# Run export loop
while true; do
    sh /db-export.sh /exports
    sleep 86400
done
