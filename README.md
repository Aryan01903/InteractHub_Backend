# InteractHub API

Fastify + TypeScript + Mongoose backend for InteractHub — a multi-tenant,
role-based real-time collaboration platform.

```
Node 22 · Fastify 5 · TypeScript 5.7 · Mongoose 8 · Socket.IO 4 · Zod 3 · Pino
```

## Getting started

```bash
npm install
cp .env.example .env      # fill in DB_URL and SECRET at minimum
npm run preflight         # read-only: what would the migration change?
npm run migrate           # required once, if you have existing v1 data
npm run verify:migration  # read-only: can the app read what it now owns?
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Watch mode via `tsx` |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preflight` | **Read-only.** Reports exactly what the migration would touch |
| `npm run migrate` | One-shot v1 → v2 data migration, and index creation |
| `npm run verify:migration` | **Read-only.** Boots the app against the live database and drives it as a real migrated user |
| `npm run smoke` | 42 HTTP-level assertions against an in-memory MongoDB |
| `npm run bootcheck` | 15 assertions against a real listening server + sockets |
| `npm test` | Both of the above |

## Architecture

```
src/
  config/       env (Zod-validated), rbac matrix, socket event catalogue
  plugins/      mongo, auth (JWT + org scoping), error handler
  models/       Mongoose schemas + indexes
  modules/      auth · org · conversation · message · board · call · search
                  each: <name>.routes.ts, <name>.service.ts, <name>.schemas.ts
  realtime/     Socket.IO gateway, guards, presence, board + call handlers
  utils/        serializers, cursor, crypto, mailer, logger, errors, response
  scripts/      preflight, migrate, verify-migration, smoke, bootcheck
```

Routes validate and shape; services hold the domain logic; serializers own the
wire format. Every REST response *and* every socket broadcast goes through the
same serializer, so a message delivered over HTTP is byte-identical to the same
message pushed over the socket.

## Authorization

Three steps, and the third is the one that matters:

1. The **JWT** proves who you are. It carries no authority.
2. The **`X-Org-Id` header** names which organization the request is for.
3. The server looks up the `(user, org)` **Membership** on every request and
   derives the role from that row.

Step 3 never trusts steps 1 or 2. A role change or a removal takes effect on the
next request rather than when a seven-day token expires, and a request naming an
organization you do not belong to fails before any handler runs.

Roles are `owner > admin > moderator > member > guest`, expressed as a
role → permission matrix in `config/rbac.ts`. Handlers ask about *permissions*,
never about roles:

```ts
app.delete("/:id", { preHandler: app.requirePermission("message:delete:own") }, ...)
```

Two invariants stop sideways privilege escalation: you may only act on someone
of strictly lower rank, and you may only grant a role below your own.

## Cursor pagination

History is keyset-paginated on `_id`:

```
GET /api/messages?conversationId=<id>&limit=50&before=<cursor>
```

```json
{ "success": true, "data": { "items": [...], "nextCursor": "...", "hasMore": true } }
```

`_id` rather than `createdAt` because an ObjectId is unique and monotonic; two
messages sharing a millisecond would tie on a timestamp and silently drop or
repeat a row at a page boundary. `limit + 1` rows are fetched so `hasMore` is
known without a second `countDocuments`, and the compound index
`{ conversationId: 1, _id: -1 }` serves both the predicate and the sort.

The smoke test asserts the property that actually matters: a message arriving
while someone scrolls does not shift or leak into the older page.

## API

All responses share one envelope — `{ success, data, message? }` on success,
`{ success: false, error: { code, message, details? } }` on failure.

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/{register,verify-otp,login,request-otp,forgot-password,reset-password,accept-invite,switch-org}`, `GET/PATCH /api/auth/me`, `GET /api/auth/invite` |
| Organizations | `GET/POST /api/orgs`, `GET/PATCH /api/orgs/current`, `…/members`, `…/invites`, `…/members/:userId/role`, `…/transfer-ownership`, `…/leave` |
| Conversations | `GET/POST /api/conversations`, `POST …/direct`, `GET/PATCH/DELETE …/:id`, `POST …/:id/read` |
| Messages | `GET /api/messages`, `GET …/context`, `POST /api/messages`, `PATCH/DELETE …/:id`, `POST …/:id/reactions`, `POST …/uploads` |
| Boards | `GET/POST /api/boards`, `GET/PUT/DELETE …/:id`, `GET …/:id/versions` |
| Calls | `GET/POST /api/calls`, `GET …/:roomId`, `POST …/:roomId/end` |
| Search | `GET /api/search`, `GET /api/search/members` |
| Contact | `POST /api/contact` (public), `POST /api/contact/admin/session`, `GET /api/contact`, `GET …/stats`, `PATCH …/:id` |

## Realtime

Event names live in `config/events.ts` and are mirrored verbatim by
`InteractHub_FE/src/lib/realtime/events.ts`. Room names are always derived
server-side from verified identity, so a client can never name the room it
joins — which is what keeps organizations isolated over the socket.

Authorization is checked **before** `socket.join`, never after. Joining first
and validating second leaves the socket subscribed to a room it was refused
data from, which is a working cross-tenant read.

## Migration from v1

`npm run migrate` is idempotent and safe to re-run. It:

1. Gives every tenant a slug, and an explicit owner where one can be resolved.
2. Converts `User.tenantId` + `User.role` into `Membership` rows.
3. Creates `#general` per organization and attaches all existing messages to it.
4. Rewrites `message.files` into `message.attachments`.
5. Replaces the unbounded `readBy` arrays with per-conversation read cursors,
   seeded so nobody logs in to a wall of false unreads.
6. Hashes invite tokens — existing invitation links keep working, because the
   link carries the plaintext and lookup now hashes before matching.
7. Moves embedded board versions into their own collection.
8. Drops the legacy `role`, `tenantId`, `tenantName`, `otp` fields.
9. Builds every index.

Take a database backup first, and run `npm run preflight` to see the plan
before committing to it. The API will not serve pre-migration data correctly,
so run the migration before deploying.

**Organizations with no members are slugged but skipped.** No owner can be
resolved for them and no membership points at them, so they are unreachable in
the app — they are left in place rather than deleted, for you to decide on.

`npm run verify:migration` is the check worth running afterwards: it boots the
real application against the live database, mints a token for an actual
migrated user, and makes only GET requests. A row count cannot tell you the app
can read what it now owns; this can.

## The contact inbox

`POST /api/contact` is public and rate limited to five submissions per ten
minutes per address. Everything that reads submissions sits behind a separate
credential: `POST /api/contact/admin/session` checks `ADMIN_PASSWORD` with a
timing-safe comparison and returns a two-hour token carrying `scope: "admin"`.

That token is deliberately not a user session. It has no `sub`, so `authenticate`
rejects it, and a normal user token has no `scope`, so the inbox rejects that.
Both directions are asserted in the smoke suite. Leaving `ADMIN_PASSWORD` unset
disables the console entirely.

### Test-script safety

`smoke` and `bootcheck` call `syncIndexes()`, which creates collections and can
drop indexes. Both refuse outright to start against anything but a local
instance, so a stray `.env` cannot point them at a real cluster.
