/* eslint-disable no-console */
import { MongoMemoryReplSet } from "mongodb-memory-server";

const LAUNCH_TIMEOUT = 120_000;
const ADMIN_PASSWORD = "smoke-admin-password";


let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  [32mPASS[0m  ${label}`);
  } else {
    failed += 1;
    console.log(`  [31mFAIL[0m  ${label}`);
    if (detail !== undefined) {
      console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
    }
  }
}

function section(title: string) {
  console.log(`\n[1m${title}[0m`);
}

function assertEphemeral(uri: string) {
  const local = /^mongodb:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)[:/]/.test(uri);
  if (!local) {
    console.error(
      `
Refusing to run: DB_URL is not a local instance.
  ${uri.replace(/\/\/[^@]*@/, "//<credentials>@")}
`,
    );
    process.exit(1);
  }
}

async function main() {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: LAUNCH_TIMEOUT }],
  });

  process.env.DB_URL = mongo.getUri("interacthub_smoke");
  process.env.SECRET = "smoke-test-secret-that-is-long-enough-32+";
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.PORT = "5099";

  assertEphemeral(process.env.DB_URL as string);

  const { buildApp } = await import("../app");
  const { User } = await import("../models/user.model");
  const { Membership } = await import("../models/membership.model");
  const { Conversation } = await import("../models/conversation.model");
  const { createOrganization } = await import("../modules/org/org.service");
  const { hashPassword } = await import("../utils/crypto");

  const app = await buildApp();
  await app.ready();

  const mkUser = async (name: string, email: string) =>
    User.create({
      name,
      email,
      password: await hashPassword("Password1!"),
      isVerified: true,
    });

  const alice = await mkUser("Alice", "alice@example.com");
  const bob = await mkUser("Bob", "bob@example.com");
  const mallory = await mkUser("Mallory", "mallory@example.com");

  const acme = await createOrganization({ name: "Acme", ownerId: String(alice._id) });
  const evilCorp = await createOrganization({
    name: "EvilCorp",
    ownerId: String(mallory._id),
  });

  await Membership.create({
    userId: bob._id,
    orgId: acme._id,
    role: "member",
    joinedAt: new Date(),
  });

  const token = (user: { _id: unknown; email: string; name: string }, orgId?: string) =>
    app.jwt.sign({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      ...(orgId ? { activeOrgId: orgId } : {}),
    });

  const aliceToken = token(alice, String(acme._id));
  const bobToken = token(bob, String(acme._id));
  const malloryToken = token(mallory, String(evilCorp._id));

  const call = (
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    url: string,
    opts: { token?: string; orgId?: string; payload?: unknown } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.orgId ? { "x-org-id": opts.orgId } : {}),
      },
      ...(opts.payload !== undefined ? { payload: opts.payload as object } : {}),
    });

  const general = await Conversation.findOne({ orgId: acme._id, slug: "general" });
  const generalId = String(general?._id);

  section("Tenant isolation");

  const crossOrg = await call("GET", "/api/conversations", {
    token: malloryToken,
    orgId: String(acme._id),
  });
  check(
    "member of EvilCorp cannot list Acme conversations",
    crossOrg.statusCode === 403,
    { status: crossOrg.statusCode, body: crossOrg.json() },
  );

  const crossMessages = await call(
    "GET",
    `/api/messages?conversationId=${generalId}`,
    { token: malloryToken, orgId: String(evilCorp._id) },
  );
  check(
    "naming another org's conversation id under your own org returns 404, not data",
    crossMessages.statusCode === 404,
    { status: crossMessages.statusCode },
  );

  const noOrgHeader = await call("GET", "/api/conversations", { token: aliceToken });
  check(
    "token's activeOrgId is accepted when no header is sent",
    noOrgHeader.statusCode === 200,
    { status: noOrgHeader.statusCode, body: noOrgHeader.json() },
  );

  const forgedOrg = await call("GET", "/api/conversations", {
    token: token(mallory, String(acme._id)), // claims Acme in the token itself
  });
  check(
    "a forged activeOrgId claim grants nothing (membership is re-checked)",
    forgedOrg.statusCode === 403,
    { status: forgedOrg.statusCode },
  );

  section("Authentication");

  const naiveReset = await call("POST", "/api/auth/reset-password", {
    payload: { email: "alice@example.com", password: "NewPassword1!" },
  });
  check(
    "password reset without a token is rejected (was full account takeover)",
    naiveReset.statusCode === 400,
    { status: naiveReset.statusCode, body: naiveReset.json() },
  );

  const badToken = await call("POST", "/api/auth/reset-password", {
    payload: { token: "x".repeat(43), password: "NewPassword1!" },
  });
  check("password reset with a bogus token is rejected", badToken.statusCode === 400);

  const wrongLogin = await call("POST", "/api/auth/login", {
    payload: { email: "alice@example.com", password: "WrongPassword1!" },
  });
  const missingLogin = await call("POST", "/api/auth/login", {
    payload: { email: "nobody@example.com", password: "WrongPassword1!" },
  });
  check(
    "login does not reveal whether an account exists",
    wrongLogin.statusCode === missingLogin.statusCode &&
      wrongLogin.json().error?.message === missingLogin.json().error?.message,
    { wrong: wrongLogin.json(), missing: missingLogin.json() },
  );

  const goodLogin = await call("POST", "/api/auth/login", {
    payload: { email: "alice@example.com", password: "Password1!" },
  });
  check("valid credentials sign in", goodLogin.statusCode === 200, goodLogin.json());
  check(
    "session carries the caller's organizations",
    goodLogin.json().data?.organizations?.length === 1,
    goodLogin.json().data?.organizations,
  );

  section("Cursor pagination");

  const TOTAL = 120;

  const { Message } = await import("../models/message.model");
  for (let i = 0; i < TOTAL; i += 1) {
    await Message.create({
      orgId: acme._id,
      conversationId: general!._id,
      sender: alice._id,
      content: `message ${i}`,
      type: "text",
    });
  }

  const seen = new Set<string>();
  const ordered: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const url = `/api/messages?conversationId=${generalId}&limit=40${cursor ? `&before=${cursor}` : ""}`;
    const res = await call("GET", url, { token: aliceToken, orgId: String(acme._id) });
    if (res.statusCode !== 200) {
      check("history page fetch", false, res.json());
      break;
    }
    const body = res.json().data as {
      items: Array<{ _id: string; content: string }>;
      nextCursor: string | null;
      hasMore: boolean;
    };

    for (const item of body.items) {
      if (seen.has(item._id)) {
        check("no duplicate message across pages", false, item._id);
      }
      seen.add(item._id);
    }
    ordered.unshift(...body.items.map((item) => item.content));

    cursor = body.nextCursor;
    pages += 1;
  } while (cursor && pages < 10);

  check(`every message retrieved exactly once (${seen.size}/${TOTAL})`, seen.size === TOTAL);
  check("pagination terminated rather than looping", cursor === null, { pages });
  check(
    "messages come back in chronological order",
    ordered[0] === "message 0" && ordered[ordered.length - 1] === `message ${TOTAL - 1}`,
    { first: ordered[0], last: ordered[ordered.length - 1] },
  );

  const withLimit = await call(
    "GET",
    `/api/messages?conversationId=${generalId}&limit=40`,
    { token: aliceToken, orgId: String(acme._id) },
  );
  check(
    "hasMore is true while older history remains",
    withLimit.json().data?.hasMore === true,
  );

  section("Cursor stability under concurrent writes");

  const firstPage = await call(
    "GET",
    `/api/messages?conversationId=${generalId}&limit=20`,
    { token: aliceToken, orgId: String(acme._id) },
  );
  const firstCursor = firstPage.json().data.nextCursor as string;

  await call("POST", "/api/messages", {
    token: bobToken,
    orgId: String(acme._id),
    payload: { conversationId: generalId, content: "arrives mid-scroll" },
  });

  const secondPage = await call(
    "GET",
    `/api/messages?conversationId=${generalId}&limit=20&before=${firstCursor}`,
    { token: aliceToken, orgId: String(acme._id) },
  );
  const secondIds = (secondPage.json().data.items as Array<{ content: string }>).map(
    (m) => m.content,
  );
  check(
    "a message arriving mid-scroll does not leak into or shift the older page",
    !secondIds.includes("arrives mid-scroll") &&
      !secondIds.some((c) => (firstPage.json().data.items as Array<{ content: string }>).some((f) => f.content === c)),
    secondIds.slice(0, 3),
  );

  section("Role-based access control");

  const aliceMessage = await call("POST", "/api/messages", {
    token: aliceToken,
    orgId: String(acme._id),
    payload: { conversationId: generalId, content: "owned by alice" },
  });
  const aliceMessageId = aliceMessage.json().data._id as string;

  const bobDeletes = await call("DELETE", `/api/messages/${aliceMessageId}`, {
    token: bobToken,
    orgId: String(acme._id),
  });
  check("a member cannot delete someone else's message", bobDeletes.statusCode === 403, {
    status: bobDeletes.statusCode,
  });

  const bobEdits = await call("PATCH", `/api/messages/${aliceMessageId}`, {
    token: bobToken,
    orgId: String(acme._id),
    payload: { content: "tampered" },
  });
  check("a member cannot edit someone else's message", bobEdits.statusCode === 403);

  const bobInvites = await call("POST", "/api/orgs/current/invites", {
    token: bobToken,
    orgId: String(acme._id),
    payload: { email: "new@example.com", role: "member" },
  });
  check("a member cannot invite (needs moderator+)", bobInvites.statusCode === 403);

  await Membership.updateOne(
    { userId: bob._id, orgId: acme._id },
    { $set: { role: "moderator" } },
  );

  const modDeletes = await call("DELETE", `/api/messages/${aliceMessageId}`, {
    token: bobToken,
    orgId: String(acme._id),
  });
  check(
    "a moderator can delete any message (role change takes effect immediately)",
    modDeletes.statusCode === 200,
    modDeletes.json(),
  );

  const escalate = await call("POST", "/api/orgs/current/invites", {
    token: bobToken,
    orgId: String(acme._id),
    payload: { email: "puppet@example.com", role: "owner" },
  });
  check(
    "a moderator cannot invite someone at or above their own rank",
    escalate.statusCode === 403,
    escalate.json(),
  );

  section("Messages");

  const deletedFetch = await call(
    "GET",
    `/api/messages?conversationId=${generalId}&limit=100`,
    { token: aliceToken, orgId: String(acme._id) },
  );
  const tombstone = (deletedFetch.json().data.items as Array<{ _id: string; isDeleted: boolean; content: string }>)
    .find((m) => m._id === aliceMessageId);
  check(
    "a deleted message is tombstoned with its content stripped",
    tombstone?.isDeleted === true && tombstone?.content === "",
    tombstone,
  );

  const reactTarget = await call("POST", "/api/messages", {
    token: aliceToken,
    orgId: String(acme._id),
    payload: { conversationId: generalId, content: "react to me" },
  });
  const reactId = reactTarget.json().data._id as string;

  const react1 = await call("POST", `/api/messages/${reactId}/reactions`, {
    token: bobToken,
    orgId: String(acme._id),
    payload: { emoji: "🔥" },
  });
  check(
    "a reaction is added",
    react1.json().data?.reactions?.[0]?.count === 1,
    react1.json().data?.reactions,
  );

  const react2 = await call("POST", `/api/messages/${reactId}/reactions`, {
    token: bobToken,
    orgId: String(acme._id),
    payload: { emoji: "🔥" },
  });
  check(
    "reacting again removes it and drops the empty bucket",
    (react2.json().data?.reactions?.length ?? 0) === 0,
    react2.json().data?.reactions,
  );

  section("Read state");

  const beforeRead = await call("GET", "/api/conversations", {
    token: bobToken,
    orgId: String(acme._id),
  });
  const unreadBefore = (beforeRead.json().data as Array<{ _id: string; unreadCount: number }>)
    .find((c) => c._id === generalId)?.unreadCount ?? 0;
  check("unread messages are counted", unreadBefore > 0, { unreadBefore });

  await call("POST", `/api/conversations/${generalId}/read`, {
    token: bobToken,
    orgId: String(acme._id),
    payload: {},
  });

  const afterRead = await call("GET", "/api/conversations", {
    token: bobToken,
    orgId: String(acme._id),
  });
  const unreadAfter = (afterRead.json().data as Array<{ _id: string; unreadCount: number }>)
    .find((c) => c._id === generalId)?.unreadCount ?? -1;
  check("marking read clears the count", unreadAfter === 0, { unreadAfter });

  section("Private conversations");

  const privateChannel = await call("POST", "/api/conversations", {
    token: aliceToken,
    orgId: String(acme._id),
    payload: {
      type: "channel",
      name: "leadership",
      isPrivate: true,
      participantIds: [String(alice._id)],
    },
  });
  const privateId = privateChannel.json().data._id as string;

  const bobList = await call("GET", "/api/conversations", {
    token: bobToken,
    orgId: String(acme._id),
  });
  check(
    "a private channel is absent from a non-participant's list",
    !(bobList.json().data as Array<{ _id: string }>).some((c) => c._id === privateId),
  );

  const bobDirect = await call("GET", `/api/conversations/${privateId}`, {
    token: bobToken,
    orgId: String(acme._id),
  });
  check(
    "fetching a private channel by id reports 404, not 403 (no existence oracle)",
    bobDirect.statusCode === 404,
    { status: bobDirect.statusCode },
  );

  section("Search");

  const found = await call("GET", "/api/search?q=react", {
    token: aliceToken,
    orgId: String(acme._id),
  });
  check(
    "search runs (proves the text index exists - $text throws without it)",
    found.statusCode === 200,
    found.json(),
  );
  check(
    "it finds the message by word",
    (found.json().data?.messages as Array<{ content: string }>)?.some((m) =>
      m.content.includes("react"),
    ),
    found.json().data?.messages?.length,
  );

  const searchIsolated = await call("GET", "/api/search?q=react", {
    token: malloryToken,
    orgId: String(evilCorp._id),
  });
  check(
    "search does not cross organizations",
    (searchIsolated.json().data?.messages as unknown[])?.length === 0,
    searchIsolated.json().data?.messages,
  );

  const privateHidden = await call("GET", "/api/search?q=leadership", {
    token: bobToken,
    orgId: String(acme._id),
  });
  check(
    "a private channel a non-participant cannot see is absent from search",
    (privateHidden.json().data?.conversations as unknown[])?.length === 0,
    privateHidden.json().data?.conversations,
  );

  section("API contract");

  const health = await app.inject({ method: "GET", url: "/health" });
  check("health responds", health.statusCode === 200);

  const badBody = await call("POST", "/api/messages", {
    token: aliceToken,
    orgId: String(acme._id),
    payload: { conversationId: "not-an-id", content: "x" },
  });
  check(
    "invalid input returns a 400 with the standard failure envelope",
    badBody.statusCode === 400 && badBody.json().success === false,
    badBody.json(),
  );

  const empty = await call("POST", "/api/messages", {
    token: aliceToken,
    orgId: String(acme._id),
    payload: { conversationId: generalId, content: "   " },
  });
  check("an empty message is rejected", empty.statusCode === 400);

  const missing = await call("GET", "/api/nope", { token: aliceToken });
  check(
    "unknown routes use the same envelope",
    missing.statusCode === 404 && missing.json().success === false,
  );

  section("Contact and the admin console");

  const submitted = await call("POST", "/api/contact", {
    payload: {
      name: "Grace Hopper",
      email: "grace@example.com",
      topic: "sales",
      message: "We are evaluating InteractHub for a team of twelve.",
    },
  });
  check(
    "the contact form accepts an anonymous submission",
    submitted.statusCode === 201 && submitted.json().success === true,
    submitted.statusCode,
  );

  const shortMessage = await call("POST", "/api/contact", {
    payload: { name: "G", email: "not-an-email", topic: "sales", message: "hi" },
  });
  check("it rejects an invalid submission", shortMessage.statusCode === 400);

  const anonymousList = await call("GET", "/api/contact");
  check(
    "the inbox is closed to anonymous callers",
    anonymousList.statusCode === 401,
    anonymousList.statusCode,
  );

  const userList = await call("GET", "/api/contact", { token: aliceToken });
  check(
    "a normal session token cannot read the inbox",
    userList.statusCode === 403 || userList.statusCode === 401,
    userList.statusCode,
  );

  const wrongPassword = await call("POST", "/api/contact/admin/session", {
    payload: { password: "not-the-password" },
  });
  check("a wrong admin password is refused", wrongPassword.statusCode === 401);

  const adminSession = await call("POST", "/api/contact/admin/session", {
    payload: { password: ADMIN_PASSWORD },
  });
  check("the admin password mints a session", adminSession.statusCode === 200);

  const adminToken = (adminSession.json().data as { token?: string })?.token ?? "";

  const inbox = await call("GET", "/api/contact", { token: adminToken });
  const inboxPage = inbox.json().data as { items?: unknown[] } | undefined;
  check(
    "the admin token reads the inbox through the standard envelope",
    inbox.statusCode === 200 && Array.isArray(inboxPage?.items),
    inbox.statusCode,
  );

  const crossUse = await call("GET", "/api/orgs", { token: adminToken });
  check(
    "the admin token is not a user token",
    crossUse.statusCode === 401,
    crossUse.statusCode,
  );

  await app.close();
  await mongo.stop();

  console.log(
    `\n[1m${passed} passed, ${failed} failed[0m\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error("smoke run crashed:", error);
  process.exit(1);
});
