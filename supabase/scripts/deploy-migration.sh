#!/usr/bin/env bash
# Applies any supabase/migrations/*.sql files not yet recorded on the
# self-hosted instance, in filename (timestamp) order, over SSH — since
# the VPS's Postgres isn't exposed to the internet, `supabase db push`
# can't reach it directly. This is the replacement for that command.
set -euo pipefail

SSH_HOST="${SUPABASE_VPS_HOST:-ubuntu-oracle}"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db-ba99m6dmxbmvm32x3db93ky3}"
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../migrations" && pwd)"

remote_psql() {
  ssh "$SSH_HOST" "sudo docker exec -i $DB_CONTAINER psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1" "$@"
}

applied_versions=$(ssh "$SSH_HOST" "sudo docker exec $DB_CONTAINER psql -U supabase_admin -d postgres -tAc \"select version from supabase_migrations.schema_migrations order by version;\"")

for file in "$MIGRATIONS_DIR"/*.sql; do
  base=$(basename "$file")
  version="${base%%_*}"
  name="${base#*_}"
  name="${name%.sql}"

  if grep -qx "$version" <<< "$applied_versions"; then
    echo "skip  $base (already applied)"
    continue
  fi

  echo "apply $base"
  remote_psql < "$file"
  remote_psql <<SQL
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$name');
SQL
  echo "done  $base"
done
