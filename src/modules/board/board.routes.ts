import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Types } from "mongoose";
import { Whiteboard, BoardVersion } from "../../models/board.model";
import { ok } from "../../utils/response";
import { requireAuth, requireOrg } from "../../plugins/auth";
import { forbidden, notFound } from "../../utils/errors";
import { can } from "../../config/rbac";
import { SOCKET_EVENTS, rooms } from "../../config/events";
import { getRealtime } from "../../realtime";
import { toWhiteboard, toWhiteboardSummary } from "../../utils/serializers";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

const MAX_VERSIONS = 20;

const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { preHandler: app.requirePermission("board:view") }, async (request) => {
    const org = requireOrg(request);

    const boards = await Whiteboard.find({ orgId: org.objectId })
      .select("-data")
      .populate("createdBy", "name avatarUrl presenceStatus")
      .populate("lastEditedBy", "name avatarUrl presenceStatus")
      .sort({ updatedAt: -1 })
      .limit(200);

    return ok(boards.map(toWhiteboardSummary));
  });

  app.post(
    "/",
    {
      schema: {
        body: z.object({
          name: z.string().trim().min(1).max(80),
          data: z.unknown().optional(),
        }),
      },
      preHandler: app.requirePermission("board:create"),
    },
    async (request, reply) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const board = await Whiteboard.create({
        name: request.body.name,
        orgId: org.objectId,
        createdBy: new Types.ObjectId(auth.userId),
        data: request.body.data ?? null,
      });

      await board.populate("createdBy", "name avatarUrl presenceStatus");
      reply.status(201);
      return ok(toWhiteboardSummary(board), `${board.name} created`);
    },
  );

  app.get(
    "/:id",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("board:view"),
    },
    async (request) => {
      const org = requireOrg(request);

      const board = await Whiteboard.findOne({
        _id: new Types.ObjectId(request.params.id),
        orgId: org.objectId,
      })
        .populate("createdBy", "name avatarUrl presenceStatus")
        .populate("lastEditedBy", "name avatarUrl presenceStatus");

      if (!board) throw notFound("Board");
      return ok(toWhiteboard(board));
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({
          data: z.unknown(),
          name: z.string().trim().min(1).max(80).optional(),
          thumbnail: z.string().max(200_000).optional(),
          snapshot: z.boolean().default(false),
        }),
      },
      preHandler: app.requirePermission("board:update"),
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const board = await Whiteboard.findOne({
        _id: new Types.ObjectId(request.params.id),
        orgId: org.objectId,
      });
      if (!board) throw notFound("Board");

      if (request.body.snapshot && board.data) {
        await BoardVersion.create({
          boardId: board._id,
          orgId: org.objectId,
          data: board.data,
          createdBy: new Types.ObjectId(auth.userId),
        });

        const stale = await BoardVersion.find({ boardId: board._id })
          .select("_id")
          .sort({ _id: -1 })
          .skip(MAX_VERSIONS)
          .lean();
        if (stale.length > 0) {
          await BoardVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
        }
      }

      board.data = request.body.data;
      if (request.body.name) board.name = request.body.name;
      if (request.body.thumbnail) board.thumbnail = request.body.thumbnail;
      board.lastEditedBy = new Types.ObjectId(auth.userId);
      await board.save();

      return ok({ _id: String(board._id), updatedAt: board.updatedAt.toISOString() });
    },
  );

  app.delete(
    "/:id",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("board:delete:own"),
    },
    async (request) => {
      const auth = requireAuth(request);
      const org = requireOrg(request);

      const board = await Whiteboard.findOne({
        _id: new Types.ObjectId(request.params.id),
        orgId: org.objectId,
      });
      if (!board) throw notFound("Board");

      const isCreator = String(board.createdBy) === auth.userId;
      if (!isCreator && !can(org.role, "board:delete:any")) {
        throw forbidden("Only the creator or a moderator can delete this board");
      }

      await Promise.all([
        BoardVersion.deleteMany({ boardId: board._id }),
        board.deleteOne(),
      ]);

      getRealtime()?.to(rooms.board(request.params.id)).emit(SOCKET_EVENTS.BOARD_CLEAR, {
        boardId: request.params.id,
        deleted: true,
      });

      return ok({ _id: request.params.id }, "Board deleted");
    },
  );

  app.get(
    "/:id/versions",
    {
      schema: { params: z.object({ id: objectId }) },
      preHandler: app.requirePermission("board:view"),
    },
    async (request) => {
      const org = requireOrg(request);

      const versions = await BoardVersion.find({
        boardId: new Types.ObjectId(request.params.id),
        orgId: org.objectId,
      })
        .select("-data")
        .populate("createdBy", "name avatarUrl presenceStatus")
        .sort({ _id: -1 })
        .limit(MAX_VERSIONS);

      return ok(
        versions.map((version) => ({
          _id: String(version._id),
          createdAt: version.createdAt.toISOString(),
          createdBy: version.createdBy ? String(version.createdBy) : null,
        })),
      );
    },
  );
};

export default boardRoutes;
