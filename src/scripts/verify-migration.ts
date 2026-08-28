/* eslint-disable no-console */
import "dotenv/config";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
  } else {
    failed += 1;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 300)}`);
  }
}

async function main() {
  process.env.LOG_LEVEL = "silent";

  const { buildApp } = await import("../app");
  const { User } = await import("../models/user.model");
  const { Membership } = await import("../models/membership.model");
  const { Organization } = await import("../models/organization.model");
  const { Conversation } = await import("../models/conversation.model");

  const app = await buildApp();
  await app.ready();

  const membership = await Membership.findOne({ status: "active" })
    .populate<{ userId: { _id: unknown; name: string; email: string } }>(
      "userId",
      "name email",
    )
    .lean();

  if (!membership?.userId) {
    console.error("No active membership found — did the migration run?");
    process.exit(1);
  }

  const user = membership.userId;
  const orgId = String(membership.orgId);
  const org = await Organization.findById(orgId).lean();

  console.log(
    `\n\x1b[1mActing as\x1b[0m  ${user.name} <${user.email}>  ` +
      `role=${membership.role}  org=${org?.name}\n`,
  );

  const token = app.jwt.sign({
    sub: String(user._id),
    email: user.email,
    name: user.name,
    activeOrgId: orgId,
  });

  const get = (url: string, org?: string) =>
    app.inject({
      method: "GET",
      url,
      headers: {
        authorization: `Bearer ${token}`,
        ...(org ? { "x-org-id": org } : {}),
      },
    });

  console.log("\x1b[1mSession\x1b[0m");

  const me = await get("/api/auth/me");
  const session = me.json().data as {
    user: { name: string; email: string };
    organizations: Array<{ _id: string; name: string; role: string; permissions: string[] }>;
    activeOrgId: string | null;
  };

  check("the migrated account resolves a session", me.statusCode === 200, me.statusCode);
  check(
    "it carries at least one organization with a role and permissions",
    session.organizations.length > 0 &&
      Boolean(session.organizations[0]?.role) &&
      (session.organizations[0]?.permissions?.length ?? 0) > 0,
    session.organizations.map((o) => `${o.name}:${o.role}`),
  );
  check(
    "it lands on a valid active organization",
    Boolean(session.activeOrgId) &&
      session.organizations.some((o) => o._id === session.activeOrgId),
    session.activeOrgId,
  );

  console.log("\n\x1b[1mWorkspace\x1b[0m");

  const current = await get("/api/orgs/current", orgId);
  check("the organization loads with its slug", current.statusCode === 200, current.json());
  check(
    "it has a slug and an owner",
    Boolean((current.json().data as { slug: string }).slug) && Boolean(org?.ownerId),
    { slug: (current.json().data as { slug: string }).slug, owner: String(org?.ownerId) },
  );

  const members = await get("/api/orgs/current/members", orgId);
  const roster = members.json().data as Array<{ name: string; role: string }>;
  check("the member roster loads", members.statusCode === 200, members.statusCode);
  check("every member carries a v2 role", roster.every((m) => Boolean(m.role)), roster.map((m) => `${m.name}:${m.role}`));

  console.log("\n\x1b[1mConversations\x1b[0m");

  const conversations = await get("/api/conversations", orgId);
  const list = conversations.json().data as Array<{
    _id: string;
    name: string | null;
    slug: string | null;
    unreadCount: number;
  }>;

  check("conversations load", conversations.statusCode === 200, conversations.statusCode);
  check("#general exists", list.some((c) => c.slug === "general"), list.map((c) => c.slug ?? c.name));

  const general = list.find((c) => c.slug === "general");
  if (general) {
    const history = await get(
      `/api/messages?conversationId=${general._id}&limit=50`,
      orgId,
    );
    const page = history.json().data as {
      items: Array<{ _id: string; content: string; sender: { name: string } | null; attachments: unknown[] }>;
      nextCursor: string | null;
      hasMore: boolean;
    };

    check("history loads through the cursor endpoint", history.statusCode === 200, history.statusCode);
    check(
      "migrated messages are readable with their senders resolved",
      page.items.length > 0 && page.items.every((m) => m.sender !== null),
      { count: page.items.length, first: page.items[0]?.content?.slice(0, 40) },
    );

    const withFiles = page.items.filter((m) => (m.attachments?.length ?? 0) > 0);
    check(
      `attachments survived the files -> attachments reshape (${withFiles.length} found)`,
      withFiles.every((m) =>
        (m.attachments as Array<{ url: string }>).every((a) => Boolean(a.url)),
      ),
      withFiles[0]?.attachments,
    );

    check(
      "read cursors were seeded (no wall of false unreads)",
      (general.unreadCount ?? 0) === 0,
      general.unreadCount,
    );
  }

  console.log("\n\x1b[1mBoards\x1b[0m");

  const boards = await get("/api/boards", orgId);
  const boardList = boards.json().data as Array<{ _id: string; name: string }>;
  check("boards load", boards.statusCode === 200, boards.statusCode);

  if (boardList.length > 0) {
    const first = boardList[0];
    const detail = await get(`/api/boards/${first?._id}`, orgId);
    check(
      "a migrated board opens with its canvas",
      detail.statusCode === 200,
      detail.statusCode,
    );

    const versions = await get(`/api/boards/${first?._id}/versions`, orgId);
    check(
      "extracted board versions are listable",
      versions.statusCode === 200,
      versions.statusCode,
    );
  }

  console.log("\n\x1b[1mIsolation\x1b[0m");

  const otherOrg = await Organization.findOne({ _id: { $ne: orgId } }).lean();
  if (otherOrg) {
    const foreign = await get("/api/conversations", String(otherOrg._id));
    const isMember = await Membership.exists({
      userId: user._id,
      orgId: otherOrg._id,
    });
    check(
      isMember
        ? `this account is also in "${otherOrg.name}", so access is allowed`
        : `an organization this account does not belong to ("${otherOrg.name}") is refused`,
      isMember ? foreign.statusCode === 200 : foreign.statusCode === 403,
      { status: foreign.statusCode },
    );
  }

  console.log("\n\x1b[1mCleanup\x1b[0m");

  const db = (await import("mongoose")).default.connection.db;
  const leftovers = await Promise.all([
    db!.collection("users").countDocuments({ tenantId: { $exists: true } }),
    db!.collection("users").countDocuments({ otp: { $exists: true } }),
    db!.collection("messages").countDocuments({ readBy: { $exists: true } }),
    db!.collection("messages").countDocuments({ files: { $exists: true } }),
    db!.collection("whiteboards").countDocuments({ versions: { $exists: true } }),
  ]);

  check(
    "no legacy fields remain (tenantId, otp, readBy, files, versions)",
    leftovers.every((n) => n === 0),
    { tenantId: leftovers[0], otp: leftovers[1], readBy: leftovers[2], files: leftovers[3], versions: leftovers[4] },
  );

  const orphanConversations = await Conversation.countDocuments({
    orgId: { $exists: false },
  });
  check("every conversation belongs to an organization", orphanConversations === 0);

  await app.close();

  console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error("verification crashed:", error);
  process.exit(1);
});
