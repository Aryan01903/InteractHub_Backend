export const ROLES = ["owner", "admin", "moderator", "member", "guest"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  owner: 100,
  admin: 80,
  moderator: 60,
  member: 40,
  guest: 20,
};

export const PERMISSIONS = [
  "org:view",
  "org:update",
  "org:delete",
  "org:transfer",

  "member:view",
  "member:invite",
  "member:remove",
  "member:role:update",

  "conversation:view",
  "conversation:create",
  "conversation:update",
  "conversation:delete",

  "message:send",
  "message:edit:own",
  "message:delete:own",
  "message:delete:any",
  "message:react",
  "message:pin",

  "board:view",
  "board:create",
  "board:update",
  "board:delete:own",
  "board:delete:any",

  "call:view",
  "call:create",
  "call:join",
  "call:end:any",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const GUEST: Permission[] = [
  "org:view",
  "member:view",
  "conversation:view",
  "message:send",
  "message:edit:own",
  "message:delete:own",
  "message:react",
  "board:view",
  "call:view",
  "call:join",
];

const MEMBER: Permission[] = [
  ...GUEST,
  "conversation:create",
  "board:create",
  "board:update",
  "board:delete:own",
  "call:create",
];

const MODERATOR: Permission[] = [
  ...MEMBER,
  "conversation:update",
  "message:delete:any",
  "message:pin",
  "board:delete:any",
  "call:end:any",
  "member:invite",
];

const ADMIN: Permission[] = [
  ...MODERATOR,
  "org:update",
  "member:remove",
  "member:role:update",
  "conversation:delete",
];

const OWNER: Permission[] = [...ADMIN, "org:delete", "org:transfer"];

const dedupe = (list: Permission[]) => Object.freeze([...new Set(list)]);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  guest: dedupe(GUEST),
  member: dedupe(MEMBER),
  moderator: dedupe(MODERATOR),
  admin: dedupe(ADMIN),
  owner: dedupe(OWNER),
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.guest;
}

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return permissionsFor(role).includes(permission);
}

export function outranks(actor: Role, target: Role): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((role) => ROLE_RANK[role] < ROLE_RANK[actor]);
}

export function fromLegacyRole(legacy: string | undefined | null): Role {
  return legacy === "admin" ? "owner" : "member";
}
