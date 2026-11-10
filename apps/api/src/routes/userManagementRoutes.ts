import {
  Router,
  type NextFunction,
  type Response,
} from "express";
import { UserRole, UserSpecialty } from "../entities/User.js";
import { createCsrfMiddleware } from "../middleware/csrf.js";
import { createRequireAuth } from "../middleware/requireAuth.js";
import { createRequireRole } from "../middleware/requireRole.js";
import type { SessionService } from "../services/sessionService.js";
import {
  LastActiveManagerError,
  ManagedUserNotFoundError,
  ManagerAuthorizationError,
  RoleTransitionError,
  SpecialtyRequiredError,
  type UserManagementService,
} from "../services/userManagementService.js";

const userIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxPageSize = 100;

export function createUserManagementRoutes(
  userManagementService: UserManagementService,
  sessionService: SessionService,
  webOrigin: string,
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(sessionService);
  const requireManager = createRequireRole(UserRole.GESTOR);
  const requireAllowedOrigin = createCsrfMiddleware(webOrigin);

  router.get("/api/users", requireAuth, requireManager, (request, response, next) => {
    const page = parsePositiveInteger(request.query.page, 1);
    const pageSize = parsePositiveInteger(request.query.pageSize, 20);
    if (page === null || pageSize === null || pageSize > maxPageSize) {
      response.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Parâmetros de paginação inválidos.",
        },
      });
      return;
    }

    void userManagementService.list(page, pageSize).then(
      (result) => response.status(200).json(result),
      next,
    );
  });

  router.patch(
    "/api/users/:userId/role",
    requireAuth,
    requireAllowedOrigin,
    requireManager,
    (request, response, next) => {
      const { userId } = request.params;
      const role = parseUserRole(request.body);
      const specialty = parseUserSpecialty(request.body);
      const actorId = request.authUser?.id;
      if (
        !userIdPattern.test(userId) ||
        !role ||
        !specialty.valid ||
        (role !== UserRole.MANUTENTOR && specialty.value !== undefined)
      ) {
        response.status(422).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados de alteração de perfil inválidos.",
          },
        });
        return;
      }
      if (!actorId) {
        response.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "Autenticação necessária.",
          },
        });
        return;
      }

      void userManagementService
        .changeRole(userId, role, actorId, specialty.value)
        .then(
        (user) => response.status(200).json({ data: { user } }),
        (error: unknown) => handleRoleChangeError(error, response, next),
      );
    },
  );

  return router;
}

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseUserRole(value: unknown): UserRole | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const role = "role" in value ? value.role : null;
  return role === UserRole.CLIENTE ||
    role === UserRole.MANUTENTOR ||
    role === UserRole.GESTOR
    ? role
    : null;
}

function parseUserSpecialty(
  value: unknown,
): { valid: true; value?: UserSpecialty } | { valid: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false };
  }

  if (!("specialty" in value) || value.specialty === undefined) {
    return { valid: true };
  }
  if (!isUserSpecialty(value.specialty)) {
    return { valid: false };
  }
  return { valid: true, value: value.specialty };
}

function isUserSpecialty(value: unknown): value is UserSpecialty {
  return (
    value === UserSpecialty.ELETRICA ||
    value === UserSpecialty.HIDRAULICA ||
    value === UserSpecialty.INFORMATICA ||
    value === UserSpecialty.ESTRUTURAL ||
    value === UserSpecialty.OUTROS
  );
}

function handleRoleChangeError(
  error: unknown,
  response: Response,
  next: NextFunction,
): void {
  if (error instanceof ManagerAuthorizationError) {
    response.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Você não tem permissão para alterar perfis.",
      },
    });
    return;
  }
  if (error instanceof ManagedUserNotFoundError) {
    response.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado." },
    });
    return;
  }
  if (error instanceof LastActiveManagerError) {
    response.status(409).json({
      error: {
        code: "LAST_MANAGER_REQUIRED",
        message: "A instituição precisa manter ao menos um Gestor ativo.",
      },
    });
    return;
  }
  if (error instanceof RoleTransitionError) {
    response.status(409).json({
      error: {
        code: "ROLE_TRANSITION_NOT_ALLOWED",
        message: "Esta alteração de perfil não é permitida.",
      },
    });
    return;
  }
  if (error instanceof SpecialtyRequiredError) {
    response.status(422).json({
      error: {
        code: "SPECIALTY_REQUIRED",
        message: "Selecione uma especialidade para o perfil de Manutentor.",
      },
    });
    return;
  }

  next(error);
}
