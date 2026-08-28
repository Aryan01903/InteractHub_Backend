import { Types } from "mongoose";
import { badRequest } from "./errors";

export function encodeCursor(id: Types.ObjectId | string): string {
  return String(id);
}

export function decodeCursor(
  raw: string | undefined | null,
  field = "cursor",
): Types.ObjectId | null {
  if (!raw) return null;
  if (!Types.ObjectId.isValid(raw)) {
    throw badRequest(`Invalid ${field}`);
  }
  return new Types.ObjectId(raw);
}

export function slicePage<T>(
  rows: T[],
  limit: number,
  getId: (row: T) => Types.ObjectId | string,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last ? encodeCursor(getId(last)) : null,
  };
}

export function parseLimit(raw: unknown, fallback = 50, max = 100): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}
