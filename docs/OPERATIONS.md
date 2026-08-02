# Operations

Database access, safe data poking, test-data cleanup, and deploy
verification. Read the golden rules in [AGENTS.md](../AGENTS.md) first.

## Credentials

| What | Where | Committable |
|---|---|---|
| Project URL + publishable key | `src/config.ts` | Yes — RLS protects the data |
| `sb_secret_...` admin key | Ask Arturo | **Never** — repo is public |
| Database password | GitHub repo secret `SUPABASE_DB_PASSWORD` | **Never** |

Export the admin key per shell, never into a file the repo can see:

```bash
export SB_URL=https://hrsblcjekgtncappdexx.supabase.co
export SB_SECRET=sb_secret_...        # ask; do not commit
alias sbq='curl -s "$SB_URL/rest/v1/$1" -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"'
```

## Reading data (safe)

```bash
# what's in the library
curl -s "$SB_URL/rest/v1/documents?select=title,source_type,word_count,status,created_at" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" | python3 -m json.tool

# reading positions and recent sessions
curl -s "$SB_URL/rest/v1/positions?select=document_id,word_index,wpm,updated_at" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"
curl -s "$SB_URL/rest/v1/reading_sessions?select=*&order=started_at.desc&limit=10" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"

# auth users
curl -s "$SB_URL/auth/v1/admin/users" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"
```

## Deleting data (dangerous)

> **The rule:** every DELETE names the exact rows it created. A filter that
> could match a real row (`?word_index=gte.0`, `?words_read=gte.0`,
> `?id=neq.null`) is forbidden — one of those wiped Arturo's real reading
> positions and session history. The documents survived; the progress did not.

Give test rows a `TEST` suffix in caps at creation, then delete by that:

```bash
# 1. find the test rows first — always look before deleting
curl -s "$SB_URL/rest/v1/documents?select=id,title&title=like.*TEST" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"

# 2. delete only those (positions + highlights cascade automatically)
curl -s -X DELETE "$SB_URL/rest/v1/documents?title=like.*TEST" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" -w "%{http_code}\n"

# 3. sessions keep a null document_id after the cascade — clear the orphans
curl -s -X DELETE "$SB_URL/rest/v1/reading_sessions?document_id=is.null" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" -w "%{http_code}\n"

# 4. verify the real rows are still there
curl -s "$SB_URL/rest/v1/documents?select=title,status" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"
```

Test auth users are `*@fluent-e2e.dev` and are deleted by id:

```bash
curl -s -X DELETE "$SB_URL/auth/v1/admin/users/<uuid>" \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" -w "%{http_code}\n"
```

Deleting a user cascades to all of that user's rows, which is why tests that
create their own account are the safest kind.

## Applying a migration

Schema lives in `supabase/migrations/`. It is applied by a workflow, because
Supabase's Postgres port is not reachable from every environment:

```bash
gh workflow run db-migrate.yml          # or: POST /actions/workflows/db-migrate.yml/dispatches
```

It needs the `SUPABASE_DB_PASSWORD` repo secret and tries the direct host
then every pooler region. The migration is written to be idempotent
(`create table if not exists`, `drop policy if exists`), so re-running is safe.

Verify by hitting each table — `200` means it exists and RLS lets the admin key through:

```bash
for t in documents positions reading_sessions highlights; do
  curl -s -o /dev/null -w "$t: %{http_code}\n" "$SB_URL/rest/v1/$t?select=count" \
    -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET"
done
```

### Auth settings worth knowing

Email confirmation is **on**, so self-signup shows "check your inbox". To
create a ready-to-use account:

```bash
curl -s "$SB_URL/auth/v1/admin/users" -X POST \
  -H "apikey: $SB_SECRET" -H "Authorization: Bearer $SB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@example.com","password":"...","email_confirm":true}'
```

## Verifying a deploy

Never assume a green workflow means the live site changed — the Pages CDN
serves `index.html` with `max-age=600`.

```bash
# workflow status
curl -s -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/arturitov/Fluent/actions/runs?per_page=1" |
  python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['status'], r['conclusion'])"

# the bundle the world sees vs the one you built
curl -s https://arturitov.github.io/Fluent/ | grep -o 'assets/index[^"]*js'
ls dist/assets | grep '^index.*js'
```

Those two must match before you report the fix as live. Then run
`node verify-live.mjs` (see [TESTING.md](TESTING.md)).

## Rollback

`git revert <sha> && git push` — Pages redeploys from `main`. Bump
`SHELL_CACHE` in the revert commit too, or installed phones will sit on the
bad build until their next natural update check.
