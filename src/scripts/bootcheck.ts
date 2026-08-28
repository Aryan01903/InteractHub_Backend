/* eslint-disable no-console */
import { MongoMemoryReplSet } from "mongodb-memory-server";

const LAUNCH_TIMEOUT = 120_000;


let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`  [32mPASS[0m  ${label}`);
  } else {
    failed += 1;
    console.log(`  [31mFAIL[0m  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 300)}`);
  }
}

function waitFor<T>(
  socket: { once: (event: string, cb: (payload: T) => void) => void },
  event: string,
  ms = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const PORT = 5137;
  process.env.DB_URL = mongo.getUri("interacthub_boot");
  process.env.SECRET = "bootcheck-secret-that-is-long-enough-32+";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.PORT = String(PORT);
  process.env.FRONTEND_URL = "http://localhost:3000";

  assertEphemeral(process.env.DB_URL as string);

  const { buildApp } = await import("../app");
  const { createRealtime } = await import("../realtime");
  const { User } = await import("../models/user.model");
  const { Conversation } = await import("../models/conversation.model");
  const { createOrganization } = await import("../modules/org/org.service");
  const { hashPassword } = await import("../utils/crypto");
  const { io: ioClient } = await import("socket.io-client");

  const app = await buildApp();
  await app.ready();
  const io = createRealtime(app.server, app);
  await app.listen({ port: PORT, host: "127.0.0.1" });

  const base = `http://127.0.0.1:${PORT}`;

  const alice = await User.create({
    name: "Alice",
    email: "alice@example.com",
    password: await hashPassword("Password1!"),
    isVerified: true,
  });
  const bob = await User.create({
    name: "Bob",
    email: "bob@example.com",
    password: await hashPassword("Password1!"),
    isVerified: true,
  });
  const mallory = await User.create({
    name: "Mallory",
    email: "mallory@example.com",
    password: await hashPassword("Password1!"),
    isVerified: true,
  });

  const acme = await createOrganization({ name: "Acme", ownerId: String(alice._id) });
  const evil = await createOrganization({ name: "Evil", ownerId: String(mallory._id) });

  const { Membership } = await import("../models/membership.model");
  await Membership.create({
    userId: bob._id,
    orgId: acme._id,
    role: "member",
    joinedAt: new Date(),
  });

  const general = await Conversation.findOne({ orgId: acme._id, slug: "general" });
  const conversationId = String(general?._id);

  const tokenFor = (user: { _id: unknown; email: string; name: string }, orgId: string) =>
    app.jwt.sign({
      sub: String(user._id),
      email: user.email,
      name: user.name,
      activeOrgId: orgId,
    });

  const aliceToken = tokenFor(alice, String(acme._id));
  const bobToken = tokenFor(bob, String(acme._id));
  const malloryToken = tokenFor(mallory, String(evil._id));

  console.log("\n[1mHTTP[0m");

  const health = await fetch(`${base}/health`);
  const healthBody = (await health.json()) as { success: boolean };
  check("server listens and /health responds", health.ok && healthBody.success === true);

  const unauthenticated = await fetch(`${base}/api/conversations`);
  check("an unauthenticated API call is rejected", unauthenticated.status === 401, {
    status: unauthenticated.status,
  });

  const cors = await fetch(`${base}/health`, {
    headers: { Origin: "http://localhost:3000" },
  });
  check(
    "the configured frontend origin is allowed by CORS",
    cors.headers.get("access-control-allow-origin") === "http://localhost:3000",
    cors.headers.get("access-control-allow-origin"),
  );

  const badOrigin = await fetch(`${base}/health`, {
    headers: { Origin: "http://evil.example" },
  });
  check(
    "an unknown origin gets no CORS grant",
    badOrigin.headers.get("access-control-allow-origin") === null,
  );

  console.log("\n[1mRealtime handshake[0m");

  const anonymous = ioClient(base, {
    transports: ["websocket"],
    reconnection: false,
    autoConnect: true,
  });
  const anonymousRejected = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 4000);
    anonymous.on("connect_error", () => {
      clearTimeout(timer);
      resolve(true);
    });
    anonymous.on("connect", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  anonymous.close();
  check("a socket with no token is refused", anonymousRejected);

  const aliceSocket = ioClient(base, {
    transports: ["websocket"],
    auth: { token: aliceToken },
    reconnection: false,
  });
  const ready = await waitFor<{ userId: string; orgId: string | null }>(
    aliceSocket,
    "connection:ready",
  );
  check(
    "an authenticated socket is scoped to its organization from the token",
    ready.orgId === String(acme._id) && ready.userId === String(alice._id),
    ready,
  );

  const bobSocket = ioClient(base, {
    transports: ["websocket"],
    auth: { token: bobToken },
    reconnection: false,
  });
  await waitFor(bobSocket, "connection:ready");

  console.log("\n[1mRealtime isolation[0m");

  const mallorySocket = ioClient(base, {
    transports: ["websocket"],
    auth: { token: malloryToken },
    reconnection: false,
  });
  await waitFor(mallorySocket, "connection:ready");

  mallorySocket.emit("org:switch", { orgId: String(acme._id) });
  const switchDenied = await waitFor<{ message: string }>(
    mallorySocket,
    "connection:error",
  ).then(
    () => true,
    () => false,
  );
  check("switching into a foreign organization is refused", switchDenied);

  mallorySocket.emit("conversation:subscribe", { conversationId });
  const subscribeDenied = await waitFor(mallorySocket, "connection:error").then(
    () => true,
    () => false,
  );
  check("subscribing to a foreign conversation is refused", subscribeDenied);

  let malloryHeard = false;
  mallorySocket.on("message:new", () => {
    malloryHeard = true;
  });

  console.log("\n[1mMessage delivery[0m");

  aliceSocket.emit("conversation:subscribe", { conversationId });
  bobSocket.emit("conversation:subscribe", { conversationId });
  await settle(300);

  const delivered = waitFor<{ message: { content: string; _id: string } }>(
    bobSocket,
    "message:new",
  );

  const posted = await fetch(`${base}/api/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aliceToken}`,
      "X-Org-Id": String(acme._id),
    },
    body: JSON.stringify({ conversationId, content: "hello over the wire" }),
  });
  check("posting a message succeeds", posted.status === 201, posted.status);

  const received = await delivered.catch(() => null);
  check(
    "a subscribed teammate receives it over the socket",
    received?.message?.content === "hello over the wire",
    received,
  );

  await settle(400);
  check("an outsider's socket received nothing", malloryHeard === false);

  console.log("\n[1mTyping[0m");

  const typing = waitFor<{ userId: string; typing: boolean }>(
    bobSocket,
    "typing:update",
  );
  aliceSocket.emit("typing:start", { conversationId });
  const typingPayload = await typing.catch(() => null);
  check(
    "typing reaches the other participant",
    typingPayload?.typing === true && typingPayload?.userId === String(alice._id),
    typingPayload,
  );

  console.log("\n[1mPresence[0m");

  const snapshotPromise = waitFor<{
    members: Array<{ userId: string; status: string }>;
  }>(aliceSocket, "presence:snapshot");
  aliceSocket.emit("presence:subscribe");
  const snapshot = await snapshotPromise.catch(() => null);
  check(
    "the presence snapshot lists the connected members",
    Boolean(
      snapshot?.members?.some((member) => member.userId === String(bob._id)) &&
        snapshot?.members?.some((member) => member.userId === String(alice._id)),
    ),
    snapshot?.members,
  );

  const presenceOff = waitFor<{ userId: string; status: string }>(
    aliceSocket,
    "presence:update",
  );
  bobSocket.close();
  const offline = await presenceOff.catch(() => null);
  check(
    "disconnecting broadcasts an offline transition",
    offline?.userId === String(bob._id) && offline?.status === "offline",
    offline,
  );

  console.log("\n[1mShutdown[0m");

  aliceSocket.close();
  mallorySocket.close();
  await settle(200);

  await new Promise<void>((resolve) => io.close(() => resolve()));
  await app.close();
  await mongo.stop();

  let refused = false;
  try {
    await fetch(`${base}/health`);
  } catch {
    refused = true;
  }
  check("the port is released after shutdown", refused);

  console.log(`\n[1m${passed} passed, ${failed} failed[0m\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error("bootcheck crashed:", error);
  process.exit(1);
});
