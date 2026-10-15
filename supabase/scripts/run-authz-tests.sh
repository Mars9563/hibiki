#!/usr/bin/env bash
# Runs supabase/tests/authorization.sql against the production database over SSH.
# The test file is wrapped in a transaction that is always rolled back (no data persists).
# Exit status: 0 = no abuse path succeeded and all legitimate flows worked, 1 = otherwise.
set -euo pipefail

SSH_HOST="${SUPABASE_VPS_HOST:-ubuntu-oracle}"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db-ba99m6dmxbmvm32x3db93ky3}"
TEST_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../tests" && pwd)/authorization.sql"
EXPECTED_LEGIT_LINES=25   # number of "D<n> ..." result lines when every legitimate flow works

out="$(ssh "$SSH_HOST" "sudo docker exec -i $DB_CONTAINER stdbuf -oL -eL psql -U supabase_admin -d postgres -X -q -P pager=off" < "$TEST_FILE" 2>&1 || true)"
printf '%s\n' "$out" | grep -vE '^\s*$|^ *\{"sub"|^ *\{\}|^-+$|^DETAIL|^CONTEXT|^PL/pgSQL|^  ' || true

abuse=$(printf '%s\n' "$out" | grep -cE 'EXECUTED ->|INSERTED|UPDATED|SIGN-UP ACCEPTED' || true)
legit=$(printf '%s\n' "$out" | grep -cE '^ D[0-9]+ ' || true)
echo
echo "abuse paths that succeeded: $abuse (must be 0)"
echo "legitimate flow results   : $legit (expected $EXPECTED_LEGIT_LINES)"
if [ "$abuse" -ne 0 ] || [ "$legit" -ne "$EXPECTED_LEGIT_LINES" ]; then echo "FAIL"; exit 1; fi
echo "PASS"
