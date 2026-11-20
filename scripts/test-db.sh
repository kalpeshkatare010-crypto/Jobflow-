#!/usr/bin/env bash
# Runs the database migrations and security tests against a throwaway
# PostgreSQL database. Needs PostgreSQL 15+ and psql.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./scripts/test-db.sh
#
# The test database (default "jobflow_test") is dropped and recreated each run.
set -euo pipefail

cd "$(dirname "$0")/.."
DB="${TEST_DB:-jobflow_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=VERBOSITY=terse)
# Connection string for tests that open a second connection (dblink).
DBLINK_CONN="dbname=${DB} host=${PGHOST:-localhost} port=${PGPORT:-5432} user=${PGUSER:-postgres}"
if [ -n "${PGPASSWORD:-}" ]; then DBLINK_CONN="${DBLINK_CONN} password=${PGPASSWORD}"; fi

echo "Recreating database ${DB}"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DB} with (force)" -c "create database ${DB}"

run() {
  echo "  $1"
  "${PSQL[@]}" -d "$DB" -f "$1"
}

echo "Applying Supabase stand-in"
run tests/db/supabase_stub.sql

echo "Applying migrations"
for file in supabase/migrations/*.sql; do
  run "$file"
done

echo "Running tests"
run tests/db/00_helpers.sql
for file in tests/db/*.test.sql; do
  echo "  $file"
  "${PSQL[@]}" -d "$DB" -v dblink_conn="$DBLINK_CONN" -o /dev/null -f "$file" 2>&1 | sed -e "s/^psql:[^:]*:[0-9]*: //" -e "s/^NOTICE:  //"
done

echo "Database tests passed."
