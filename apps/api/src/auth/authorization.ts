import { UserRole } from "../entities/User.js";
import type { PublicSessionUser } from "../services/sessionService.js";

export type AuthorizationAction =
  | "request:create"
  | "request:read"
  | "request:update"
  | "request:manage"
  | "asset:select"
  | "asset:manage"
  | "users:manage"
  | "reports:read";

export interface RequestAccessScope {
  ownerId: string;
  assignedMaintainerId: string | null;
}

export type AssetSelectionVisibility = "minimal" | "full";

type AuthorizationUser = Pick<PublicSessionUser, "id" | "role">;

export function isAuthorized(
  user: AuthorizationUser | null,
  action: AuthorizationAction,
  requestScope?: RequestAccessScope,
): boolean {
  if (!user) {
    return false;
  }

  switch (action) {
    case "request:create":
    case "asset:select":
      return true;
    case "request:read":
      return (
        user.role === UserRole.GESTOR ||
        (user.role === UserRole.CLIENTE &&
          requestScope?.ownerId === user.id) ||
        (user.role === UserRole.MANUTENTOR &&
          requestScope?.assignedMaintainerId === user.id)
      );
    case "request:update":
      return (
        user.role === UserRole.GESTOR ||
        (user.role === UserRole.MANUTENTOR &&
          requestScope?.assignedMaintainerId === user.id)
      );
    case "request:manage":
    case "users:manage":
    case "reports:read":
      return user.role === UserRole.GESTOR;
    case "asset:manage":
      return (
        user.role === UserRole.MANUTENTOR || user.role === UserRole.GESTOR
      );
  }
}

export function getAssetSelectionVisibility(
  user: AuthorizationUser | null,
): AssetSelectionVisibility | null {
  if (!user) {
    return null;
  }

  return user.role === UserRole.CLIENTE ? "minimal" : "full";
}
