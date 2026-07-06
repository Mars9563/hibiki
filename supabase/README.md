# supabase

Source of truth for the Postgres schema behind hibiki, managed with the
official [Supabase CLI](https://supabase.com/docs/guides/local-development)
— no ORM, just SQL migrations, the same way you'd use Prisma's
`migrations/` folder.

## Where the database actually lives

Self-hosted Supabase, deployed via Coolify on the VPS:

- API/Studio: `https://supabase.mrsdev.in`
- SSH: `ssh ubuntu-oracle` (see `~/.ssh/config`)
- Postgres container: `supabase-db-ba99m6dmxbmvm32x3db93ky3` (not exposed
  publicly — only reachable via `docker exec` on the VPS, by design)
- Coolify resource UUID: `ba99m6dmxbmvm32x3db93ky3`

Because Postgres isn't exposed to the internet, `supabase db push` /
`supabase db pull` can't talk to it directly over `--db-url`. Everything
here works around that by going through SSH + `docker exec` instead.

## Layout

- `config.toml` — CLI config. Also enables `supabase start`, a full local
  Supabase stack (Postgres 15, Auth, Rest, Studio) via Docker, for testing
  migrations before they touch the VPS.
- `migrations/*.sql` — every schema change, forward-only, timestamped.
  `20260706120000_initial_schema.sql` is the baseline captured during the
  cutover from Supabase cloud (project `fapkzammqyazquaznimd`) to
  self-hosted: all `public` schema DDL (tables, types, functions, RLS
  policies, grants), plus the one cross-schema piece that isn't part of
  `public` — the `on_auth_user_created` trigger on `auth.users` — and the
  `supabase_realtime` publication membership.
- `scripts/deploy-migration.sh` — applies any migration not yet recorded
  on the VPS, in order.

`auth` and `storage` schemas themselves are not tracked here — they're
owned and migrated by the GoTrue/Storage containers. Only the one trigger
we added on top of `auth.users` lives in our migrations.

## Adding a schema change

```bash
cd supabase
npx supabase migration new <short_description>
# edit the generated migrations/<timestamp>_<short_description>.sql by hand
```

Optionally test it against a real Postgres 15 first:

```bash
npx supabase start      # spins up local Postgres/Auth/Rest/Studio via Docker
npx supabase db reset   # wipes the local db and replays every migration in order
```

## Shipping a change to the VPS

```bash
./scripts/deploy-migration.sh
```

This SSHes in, applies every `migrations/*.sql` file not yet present in
`supabase_migrations.schema_migrations` on the target (via
`docker exec ... psql`), and records each one as applied. Safe to re-run —
already-applied migrations are skipped.

## Credentials

Not duplicated here. The live URL/anon/service-role keys the app uses are
in `client/.env` and `server/.env`. The Postgres superuser password and
JWT secret live in Coolify's `.env` for this resource
(`/data/coolify/services/ba99m6dmxbmvm32x3db93ky3/.env` on the VPS) —
only needed for infra changes (rotating keys, resizing, etc.), not for
day-to-day schema work.

Note: the backend is deployed on Railway, which holds its own copy of
`SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
as environment variables there — separate from `server/.env` and not
updated by anything in this repo. Update those in the Railway dashboard
whenever they change here.
