#!/bin/sh
set -e

echo "[yDB] Starting initialization..."

# Run database schema init (idempotent — safe to run every boot)
node db/init.js

# Run seed (idempotent — only creates admin if none exists)
node db/seed.js

echo "[yDB] Initialization complete. Starting server..."

# Execute the main CMD
exec "$@"
