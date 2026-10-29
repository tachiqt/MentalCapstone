#!/bin/bash
set -euo pipefail

PORT="${PORT:-8080}"

# Cloud Run injects PORT; bind Apache to it
sed -i "s/Listen 80/Listen ${PORT}/g" /etc/apache2/ports.conf || true
sed -i "s/:80>/:${PORT}>/g" /etc/apache2/sites-available/000-default.conf || true
sed -i "s/*:80 /*:${PORT} /g" /etc/apache2/sites-available/000-default.conf || true

export APP_URL="${APP_URL:-http://localhost:${PORT}}"

php artisan config:clear || true

echo "Running migrations..."
php artisan migrate --force

echo "Ensuring Head Doctor account..."
php artisan smartcare:ensure-head-doctor || true

if [ -n "${GOOGLE_CLOUD_STORAGE_BUCKET:-}" ]; then
  echo "Syncing web assets to GCS (best effort)..."
  php artisan smartcare:sync-web-assets || true
fi

php artisan config:cache || true
php artisan route:cache || true

echo "Starting Apache on port ${PORT}..."
exec apache2-foreground
