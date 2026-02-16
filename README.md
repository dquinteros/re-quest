# PR Attention Manager

PR Attention Manager is a Next.js dashboard for triaging pull requests that need action. The UI supports OAuth sign-in, tracked repository management, high-signal filtering, urgency sorting, badge counters, manual refresh, and write actions for comments/reviews/labels/assignees/reviewers.

## Quick Start (Development)

### Prerequisites

- Node.js `20+` and npm `10+`
- Docker and Docker Compose
- A GitHub OAuth App for local development

### First-time setup

1. Install dependencies and copy env defaults:

```bash
npm install
cp .env.example .env
```

2. Create a GitHub OAuth App:
   - GitHub path: **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Homepage URL: `http://localhost:3000`
   - Callback URL: `http://localhost:3000/api/auth/callback/github`
   - Copy the generated `Client ID` and `Client secret`

3. Update `.env` required values:

```bash
DATABASE_URL="postgresql://re_quest:re_quest@localhost:5432/re_quest?schema=public"
AUTH_SECRET="<random-secret>"
TOKEN_ENCRYPTION_KEY="<32-byte key>"
ALLOWED_GITHUB_LOGINS="<your-github-login>"
GITHUB_CLIENT_ID="<github-oauth-client-id>"
GITHUB_CLIENT_SECRET="<github-oauth-client-secret>"
```

`ALLOWED_GITHUB_LOGINS` must include your GitHub username or sign-in will be denied.

4. Start local PostgreSQL and initialize Prisma:

```bash
npm run db:up
npm run prisma:generate
npm run prisma:push
```

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with GitHub.

## Troubleshooting

- Port `5432` conflict: if PostgreSQL is already running locally, stop it or change the mapped port in your Docker setup before running `npm run db:up`.
- `npm run db:reset` is destructive: it drops and recreates the database (data loss). Use it only when you explicitly want a clean database.

## Testing

```bash
npm run test
npm run test:watch
npm run test:coverage
```

Current unit coverage focuses on urgency scoring and inbox query parsing assumptions.

## Benchmark Harness (Manual Before/After)

Use the lightweight timing harness for repeatable before/after UX-test timing snapshots:

```bash
npx tsx scripts/benchmark-ux-harness.ts --label before --repeat 5 --command "npm run test -- src/tests/home-auth-smoke.test.ts src/tests/use-keyboard-shortcuts.test.ts src/tests/use-ui-preferences.test.ts"
npx tsx scripts/benchmark-ux-harness.ts --label after --repeat 5 --command "npm run test -- src/tests/home-auth-smoke.test.ts src/tests/use-keyboard-shortcuts.test.ts src/tests/use-ui-preferences.test.ts"
```

Results are appended to `scripts/benchmark-results.jsonl` and a Markdown table row is printed for manual capture.

If you only need the template row format without executing a benchmark:

```bash
npx tsx scripts/benchmark-ux-harness.ts --label before
```

## Prisma Utilities

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:push
npm run prisma:studio
```

## Frontend Behavior

- Auth gate: unauthenticated users see a GitHub sign-in screen
- Tracked repositories: managed on `/tracked-repositories` (list/remove tracked repos and add from a selectable GitHub repo list)
- Inbox list: filter/search/sort and select PRs quickly
- Detail panel: context, urgency score breakdown, and write-action forms
- Badge counters: needs review, changes requested follow-up, failing CI
- Sync metadata: last completed sync timestamp plus manual refresh trigger

## Expected Backend Route Contracts

The frontend is wired to these routes:

- `GET /api/auth/session` (returns auth/session state)
- `GET /api/auth/signin/github` (starts GitHub OAuth flow)
- `POST /api/auth/signout` (Auth.js sign-out endpoint, CSRF-protected)
- `GET /api/tracked-repos` (list tracked repos)
- `GET /api/github/repositories` (list selectable repositories for authenticated user)
- `POST /api/tracked-repos` (body: `{ fullName: string }`)
- `DELETE /api/tracked-repos` (body: `{ fullName: string }`)
- `DELETE /api/tracked-repos/:id` (remove tracked repo by id)
- `GET /api/inbox/prs` (query-driven list + badges + sync timestamp)
- `GET /api/prs/:id` (single PR detail)
- `POST /api/sync/refresh` (manual sync trigger)
- `POST /api/prs/:id/comments`
- `POST /api/prs/:id/reviews`
- `PATCH /api/prs/:id` (title/body/state, optional milestone number, optional project IDs)
- `POST|DELETE /api/prs/:id/labels` (body: `{ labels: string[] }`)
- `POST|DELETE /api/prs/:id/assignees` (body: `{ assignees: string[] }`)
- `POST|DELETE /api/prs/:id/reviewers` (body: `{ reviewers: string[], teamReviewers?: string[] }`)
