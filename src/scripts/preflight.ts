/* eslint-disable no-console */
import mongoose from "mongoose";
import { env } from "../config/env";

async function main() {
  await mongoose.connect(env.DB_URL, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle");

  console.log(`\n\x1b[1mDatabase\x1b[0m  ${db.databaseName}`);
  console.log(`\x1b[1mHost\x1b[0m      ${mongoose.connection.host}\n`);

  const collections = await db.listCollections().toArray();
  const names = new Set(collections.map((c) => c.name));

  const count = async (name: string, filter: Record<string, unknown> = {}) =>
    names.has(name) ? db.collection(name).countDocuments(filter) : 0;

  const rows: Array<[string, number, string]> = [];

  const users = await count("users");
  const tenants = await count("tenants");
  const messages = await count("messages");
  const whiteboards = await count("whiteboards");
  const videorooms = await count("videorooms");
  const invites = await count("invites");

  rows.push(["users", users, ""]);
  rows.push(["tenants", tenants, "become organizations"]);
  rows.push(["messages", messages, "attach to #general"]);
  rows.push(["whiteboards", whiteboards, ""]);
  rows.push(["videorooms", videorooms, "become call rooms"]);
  rows.push(["invites", invites, ""]);

  console.log("\x1b[1mExisting collections\x1b[0m");
  for (const [name, n, note] of rows) {
    console.log(
      `  ${name.padEnd(14)} ${String(n).padStart(6)}${note ? `   ${note}` : ""}`,
    );
  }

  const legacyUsers = await count("users", { tenantId: { $exists: true } });
  const tenantsNeedingSlug = await count("tenants", { slug: { $exists: false } });
  const messagesToAttach = await count("messages", {
    tenantId: { $exists: true },
    conversationId: { $exists: false },
  });
  const messagesWithFiles = await count("messages", {
    files: { $exists: true, $ne: [] },
  });
  const messagesWithReadBy = await count("messages", { readBy: { $exists: true } });
  const plaintextInvites = await count("invites", { token: { $exists: true } });
  const boardsToMove = await count("whiteboards", { tenantId: { $exists: true } });
  const roomsToMove = await count("videorooms", { tenantId: { $exists: true } });

  let channelsMissing = 0;
  if (names.has("tenants")) {
    for (const tenant of await db.collection("tenants").find({}, { projection: { _id: 1 } }).toArray()) {
      const hasMembers = await db.collection("memberships").countDocuments({ orgId: tenant._id });
      if (hasMembers === 0) continue;
      const hasGeneral = names.has("conversations")
        ? await db.collection("conversations").countDocuments({ orgId: tenant._id, slug: "general" })
        : 0;
      if (hasGeneral === 0) channelsMissing += 1;
    }
  }

  const embeddedVersions = names.has("whiteboards")
    ? await db
        .collection("whiteboards")
        .aggregate([
          { $match: { versions: { $exists: true, $ne: [] } } },
          { $project: { n: { $size: "$versions" } } },
          { $group: { _id: null, total: { $sum: "$n" } } },
        ])
        .toArray()
    : [];

  console.log("\n\x1b[1mThe migration will\x1b[0m");
  const plan: Array<[string, number]> = [
    ["give tenants a slug + owner", tenantsNeedingSlug],
    ["create Membership rows", legacyUsers],
    ["create #general channels", channelsMissing],
    ["attach messages to a conversation", messagesToAttach],
    ["reshape files -> attachments", messagesWithFiles],
    ["replace readBy with read cursors", messagesWithReadBy],
    ["hash invite tokens", plaintextInvites],
    ["move whiteboards to orgId", boardsToMove],
    ["extract board versions", (embeddedVersions[0]?.total as number) ?? 0],
    ["move video rooms to orgId", roomsToMove],
  ];
  for (const [label, n] of plan) {
    const mark = n > 0 ? "\x1b[36m•\x1b[0m" : " ";
    console.log(`  ${mark} ${label.padEnd(36)} ${String(n).padStart(6)}`);
  }

  const memberships = await count("memberships");
  const conversations = await count("conversations");
  const readstates = await count("readstates");

  console.log("\n\x1b[1mv2 collections\x1b[0m");
  console.log(`  memberships    ${String(memberships).padStart(6)}`);
  console.log(`  conversations  ${String(conversations).padStart(6)}`);
  console.log(`  readstates     ${String(readstates).padStart(6)}`);

  const alreadyRun = memberships > 0 && conversations > 0;
  const nothingToDo = plan.every(([, n]) => n === 0);

  console.log(
    `\n\x1b[1mVerdict\x1b[0m  ${
      nothingToDo && alreadyRun
        ? "already migrated — running again is a no-op"
        : alreadyRun
          ? "partially migrated — re-running will finish it"
          : legacyUsers === 0 && tenants === 0
            ? "empty or already clean — nothing to migrate"
            : "not yet migrated"
    }\n`,
  );

  if (names.has("messages")) {
    const indexes = await db.collection("messages").indexes();
    console.log("\x1b[1mmessages indexes\x1b[0m");
    for (const index of indexes) {
      console.log(`  ${JSON.stringify(index.key)}`);
    }
    console.log("");
  }

  await mongoose.connection.close();
}

void main().catch((error) => {
  console.error("preflight failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
