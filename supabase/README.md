# supabase

Source of truth for the Postgres schema behind Hibiki, managed with the official [Supabase CLI](https://supabase.com/docs/guides/local-development). There is no ORM: schema changes are SQL migrations, the way you would use Prisma's `migrations/` folder.

- Table-by-table description, ER diagram, RLS and privileges: [docs/DATABASE.md](../docs/DATABASE.md)
- Security model, review and checks: [docs/SECURITY.md](../docs/SECURITY.md)

## Where the database lives

A self-hosted Supabase stack, deployed through Coolify on the project's VPS and served at `https://supabase.mrsdev.in`. Postgres itself is **not** exposed to the internet, so `supabase db push` / `supabase db pull` cannot reach it over `--db-url`. Everything here works around that by going through SSH and `docker exec` on the VPS.

The scripts read two environment variables, which default to the project's production values (see the top of each script):

| Variable | Meaning |
|---|---|
| `SUPABASE_VPS_HOST` | SSH host alias of the VPS |
| `SUPABASE_DB_CONTAINER` | Name of the Postgres container of the Supabase stack |

## Layout

```
supabase/
├── config.toml                       # CLI config; also drives `supabase start` (local stack)
├── migrations/                       # forward-only, timestamped SQL
│   ├── 20260706120000_initial_schema.sql
│   ├── 20261015120000_restrict_function_privileges.sql
│   └── 20261015120100_least_privilege_tables_and_rls.sql
├── rollbacks/                        # hand-run recovery scripts for the hardening migrations
├── scripts/
│   ├── deploy-migration.sh           # applies unapplied migrations over SSH, atomically
│   ├── run-authz-tests.sh            # runs tests/authorization.sql (always rolled back)
│   └── audit-grants.sql              # read-only: what can anon/authenticated reach?
└── tests/
    └── authorization.sql             # abuse attempts must fail; legitimate flows must work
```

- `migrations/*.sql`: every schema change. `20260706120000_initial_schema.sql` is the baseline captured during the move from Supabase Cloud to the self-hosted instance: all `public` schema DDL (tables, types, functions, RLS policies, grants), the `on_auth_user_created` trigger on `auth.users`, and the `supabase_realtime` publication membership. The two later migrations tighten privileges and RLS (see [docs/SECURITY.md](../docs/SECURITY.md)).
- `auth` and `storage` schemas are not tracked here. They are owned and migrated by the GoTrue and Storage containers. Only the one trigger we added on top of `auth.users` lives in our migrations.

## Adding a schema change

```bash
cd supabase
npx supabase migration new <short_description>
# edit the generated migrations/<timestamp>_<short_description>.sql by hand
```

Optionally test it against a real Postgres 15 first:

```bash
npx supabase start      # local Postgres/Auth/Rest/Studio via Docker
npx supabase db reset   # wipes the local db and replays every migration in order
```

**Security checklist for new objects.** The Supabase API exposes everything in `public` to the roles `anon` and `authenticated`.

- New **table**: enable RLS, write policies, and grant the API roles only the privileges they need. Default privileges no longer grant tables to them automatically.
- New **function**: PostgreSQL grants `EXECUTE` to everyone by default. Add `REVOKE ALL ON FUNCTION … FROM PUBLIC;` and grant only the role that needs it. If it is `SECURITY DEFINER`, add `SET search_path = public, pg_temp`.
- Then run `scripts/audit-grants.sql` and the authorization tests (below).

## Shipping a change to the VPS

```bash
./scripts/deploy-migration.sh
```

This SSHes in and applies every `migrations/*.sql` file not yet present in `supabase_migrations.schema_migrations`, in order. Each file runs together with its bookkeeping row in **one transaction** (`psql --single-transaction`, `ON_ERROR_STOP`), so a failing migration leaves nothing half-applied. Safe to re-run: already-applied versions are skipped.

Before applying a risky migration, take a schema backup on the VPS (`pg_dump --schema-only --schema=public`) and keep it until you have verified the result. Recovery scripts for the hardening migrations are in `rollbacks/`; they restore the *previous, less secure* state, so use them only to recover from an outage you have traced to the migration. They do not remove the row from `schema_migrations`; delete that row if you want the migration to be re-applied.

## Verifying the authorization model

```bash
./scripts/run-authz-tests.sh
```

Runs `tests/authorization.sql` against the production database inside a transaction that is **always rolled back**. It creates fake users and rooms, impersonates `anon` and a signed-in user the way PostgREST does, and checks that:

- abuse attempts fail: calling the privileged RPCs, accepting someone else's friendship, joining a group without an invite, forging friendships, bypassing message validation, pointing an avatar at someone else's asset, signing up with an invalid username;
- legitimate backend flows still work (13 of them, mirroring the real queries the backend makes).

It exits non-zero if any abuse path succeeds or a legitimate flow breaks. Run it after every migration.

```bash
ssh <vps> "sudo docker exec -i <db-container> psql -U supabase_admin -d postgres" < scripts/audit-grants.sql
```

lists which functions and tables the API roles can reach, and flags `SECURITY DEFINER` functions without a pinned `search_path` and tables without RLS.

## Credentials

Not duplicated here. Where each copy of the Supabase settings lives:

| Consumer | Where the values are |
|---|---|
| Local development | `server/.env` and `client/.env.local` (git-ignored) |
| Production backend | Kubernetes secret `hibiki-server-env` in namespace `hibiki` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). It is separate from `server/.env` and nothing in this repo updates it. If a key changes, update the secret and run `kubectl -n hibiki rollout restart deploy/hibiki-server` on the VPS. |
| Production frontend | Baked into the image at build time as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` build args in `.github/workflows/build-client.yml`. Changing the URL or publishable key means editing the workflow and rebuilding. |

The publishable (anon) key is public by design: it ships in every browser bundle. The service-role key is the secret one and must stay on the server. Stack-level secrets (Postgres superuser password, JWT secret) live in Coolify's environment file for the Supabase resource on the VPS and are needed only for infrastructure changes.
