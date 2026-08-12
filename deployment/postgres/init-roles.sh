#!/bin/sh
set -eu

api_password=$(cat "$FURS_API_DB_PASSWORD_FILE")
worker_password=$(cat "$FURS_WORKER_DB_PASSWORD_FILE")

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=api_password="$api_password" --set=worker_password="$worker_password" <<'SQL'
create role furs_api_login login password :'api_password';
create role furs_worker_login login password :'worker_password';
SQL

unset api_password worker_password
