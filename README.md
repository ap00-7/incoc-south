# INCOC South

Church service management, songbook, lyrics, and projector presentations for **Indian Church of Christ · South Sector**.

This is a standalone Next.js App Router application with Supabase Auth, PostgreSQL, row-level security, and Realtime. Published church content is publicly readable; management and synchronized presentation controls remain owner/member restricted.

## Features implemented

- Responsive near-black INCOC South design with Songs, Sunday Schedule, and Slides as the three homepage destinations and a white-cross favicon.
- Supabase email/password sign-in, invitation callback, and initial password setup.
- Server-side membership/owner route checks and database RLS.
- Owner song creation and editing, four primary song languages, reusable chorus sequencing, optional section translations, and deletion protection for songs referenced by schedules.
- Public songbook search, language filtering, lyric sections, and translations.
- Dated service drafts, reusable song references, non-song programme items, leaders, durations, private notes, ordering, publishing, and unpublishing.
- Public published service details that omit private notes and draft schedules.
- Deterministic lyric/content slide generation shared by preview and projector mode.
- Projector keyboard navigation, fullscreen, item navigation, and optional signed-in owner-controlled synchronized sessions.
- Scoped Realtime refetches for song, schedule, membership, and presentation changes.
- Versioned database migrations and pgTAP tests for tenant isolation, draft visibility, write permissions, private notes, and presentation control.
- Vitest unit tests and Playwright browser smoke tests.

## Requirements

- Node.js 22 or newer (Next.js 16 requires Node.js 20.9 or newer).
- npm.
- A Supabase project for authentication and database-backed features.
- Docker Desktop if using the Supabase local development stack.

## Local development

From this `incoc-south` directory:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

The home and sign-in pages load without Supabase configuration. Set your Supabase project URL and publishable key in `.env.local` to enable authenticated data features. The app also accepts the legacy anon-key variable for existing local setups. Do not use another application's Supabase project.

For a local Supabase instance, install Docker Desktop and run:

```powershell
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest status
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using the local values printed by `supabase status`. The app also accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when a publishable key is available. The reset command applies the ordered SQL migrations to the local database. It deletes and recreates the local database; do not use it with production data.

For hosted projects, SQL changes are supplied as reviewed SQL in the task response and must be run manually in the intended Supabase SQL Editor. Inspect the live schema and project configuration first. Never apply hosted SQL or migrations automatically, and do not assume a change is applied until the operator confirms it. Routine database changes do not create migration files.

The migration files in `supabase/migrations/` preserve the database's historical bootstrap. Do not edit or remove migrations already recorded as applied by a shared or production database.

### Environment variables

| Variable                               | Required              | Purpose                                                                                                        |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes for data features | Supabase project URL. Safe to expose publicly.                                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes for data features | Preferred public publishable key. RLS must remain enabled.                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Alternative           | Legacy name for the public anon/publishable key. Used only if the preferred variable is unset.                 |
| `SUPABASE_SERVICE_ROLE_KEY`            | Optional              | Server-only key used by the owner invitation action. Never use a `NEXT_PUBLIC_` prefix or send it to a client. |
| `NEXT_PUBLIC_SITE_URL`                 | Optional              | Invitation callback origin; set it to the deployed HTTPS URL in production.                                    |

The `.env.example` file contains placeholders only. `.env.local` is ignored by Git. Never store credentials or real user tokens in source control.

## First owner provisioning

1. Apply only the SQL explicitly provided for the intended project, manually in its Supabase SQL Editor, after reviewing its schema and configuration.
2. In the Supabase dashboard, create the first owner's Auth user and verify the email. Do not enable public sign-up.
3. Copy that user's UUID from Supabase Auth.
4. In the SQL editor for the same project, run the following after replacing the UUID:

```sql
insert into public.church_members (church_id, user_id, role)
select id, 'REPLACE_WITH_AUTH_USER_UUID'::uuid, 'owner'::public.member_role
from public.churches
where slug = 'incoc-south';
```

5. Set the application's public Supabase URL and publishable key, then sign in at `/login`.
6. For owner-managed invitations, configure `SUPABASE_SERVICE_ROLE_KEY` only in the server environment and set the Supabase Auth redirect allow-list for `${NEXT_PUBLIC_SITE_URL}/auth/callback`.

The bootstrap is a deliberate SQL operation so the first owner is never granted automatically by registration. Supabase invitation email delivery also needs an SMTP provider for production.

## Database and access model

Migration inventory (hosted ledger checked read-only on 2026-10-19):

1. `202610160001_initial_schema.sql` — church, profile, membership, song, schedule, programme, session, and disabled link tables; constraints, indexes, helper functions, triggers, RLS, and Realtime publication setup.
2. `202610160002_ordering_functions.sql` — owner-checked, transactional section and programme reordering.
3. `202610160003_membership_profiles.sql` — profile relationship and authenticated table grants.
4. `202610160004_private_notes.sql` — owner-only programme notes stored separately from viewer-readable programme rows.
5. `202610160005_realtime_tables.sql` — scoped table additions to the Supabase Realtime publication.
6. `202610160006_public_content_and_translations.sql` — additive section translation fields and read-only public access scoped to INCOC South content and published schedules; recorded as applied.

The five original migrations (`001`–`005`) are recorded as applied. The song-editor columns (`has_translation`, `start_with_chorus`, and `is_hidden`) are not yet recorded as applied. Their additive SQL is provided in the task response and must be run manually before the updated editor and public rendering can use those columns. No migration file is kept for this routine change.

`src/lib/supabase/database.types.ts` provides strict table, enum, relationship, and RPC types to both browser and server Supabase clients. After manually applying approved SQL, refresh types from the intended project and run `npm run typecheck`.

All exposed application tables have RLS enabled. Membership helpers use fixed search paths and `SECURITY DEFINER` so policies do not recurse through membership RLS. Owners are checked server-side and again by database policies. Anonymous and authenticated readers can access INCOC South songs and sections, plus published INCOC South schedules and their programme items. Draft schedules, private service notes, membership/profile data, and presentation-session controls are not public. Owner actions and membership role boundaries remain enforced by PostgreSQL. Songs referenced by a programme item cannot be deleted because of the database foreign key.

Presentation sharing by restricted URL is disabled. `presentation_links` stores hashes only and is owner-only, but no public token validation endpoint is enabled.

## Checks and tests

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Install the Playwright Chromium browser once with `npx playwright install chromium`. Browser smoke tests start the local Next.js server automatically.

Database policy and integrity tests use pgTAP and require the local Supabase stack. The suite contains 34 assertions covering public-read scope, draft and private-note visibility, membership administration, synchronized presentation control, cross-church song references, deletion restrictions, and programme position constraints:

```powershell
npx supabase@latest start
npx supabase@latest db reset
npm run db:test
```

`db reset` destroys and recreates the local database; never run it against production or a database containing data you need.

### Authenticated browser workflow test

The Playwright suite includes an end-to-end owner-to-viewer workflow. It is skipped unless it is explicitly marked as a disposable test database and all four test-account variables are present. The known hosted production project reference is blocked by the test guard.

- `E2E_TEST_DATABASE=disposable`
- `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD`
- `E2E_VIEWER_EMAIL` and `E2E_VIEWER_PASSWORD`

To run it locally:

1. Start Docker Desktop, then run `npx supabase@latest start` and `npx supabase@latest db reset` from this project directory.
2. Open local Supabase Studio at `http://localhost:54323`. Create two confirmed test users under **Authentication → Users**; one will be the owner and the other the viewer. Keep their credentials local.
3. In the local SQL editor, provision their memberships using their Auth user UUIDs:

   ```sql
   insert into public.church_members (church_id, user_id, role)
   select id, 'REPLACE_WITH_OWNER_USER_UUID'::uuid, 'owner'::public.member_role
   from public.churches where slug = 'incoc-south';

   insert into public.church_members (church_id, user_id, role)
   select id, 'REPLACE_WITH_VIEWER_USER_UUID'::uuid, 'viewer'::public.member_role
   from public.churches where slug = 'incoc-south';
   ```

4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` to the local API URL and anon key shown by `npx supabase@latest status`. Stop any already-running Next.js dev server so Playwright starts it with the new configuration.
5. Set `E2E_TEST_DATABASE=disposable` and the four `E2E_*` variables in the terminal running the test, then run:

   ```powershell
   npm run test:e2e -- --grep "owner publishes a Sunday programme"
   ```

   The test creates uniquely named song and schedule records and does not delete them; use only a disposable local database. The viewer account must already be a member, and no service-role key is needed for this test.

The test exercises sign-in as owner, song and lyric-section creation, a dated Sunday schedule with song and prayer items, publication, viewer access, and projector slide navigation. Without a separate disposable Supabase instance and test accounts, only public-page smoke tests can run; the authenticated workflow and live RLS behavior remain unverified. The workflow creates uniquely named records and does not clean them up.

## Deployment to Vercel

1. Create a separate Vercel project for this repository.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in the Vercel project environment.
3. Add `SUPABASE_SERVICE_ROLE_KEY` only if member invitations are enabled; keep it server-only.
4. Add the production callback URL to the Supabase Auth redirect allow-list.
5. Apply reviewed SQL manually in the dedicated Supabase project's SQL Editor; do not push migrations automatically.
6. Deploy using Vercel's Next.js build settings and verify public reads, sign-in, membership authorization, RLS, and presentation behavior against that project's test accounts.

## Known limitations / follow-up verification

- The hosted project has migrations `001`–`006` recorded as applied. Song-editor option SQL remains pending manual execution before those features work against a database without the new columns.
- Initial content is server-rendered once; Realtime refetches only after notified changes. Live multi-client behavior still needs testing against a configured Supabase project.
- Invitation email delivery, SMTP settings, account recovery, and Vercel production configuration remain deployment tasks.
- Restricted presentation links remain disabled by design.
