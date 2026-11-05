import { Router } from "express";
import {
  DuplicateEmailError,
  type RegisterUserInput,
  type UserRegistrationService,
} from "../services/userService.js";
import { isInstitutionId } from "../config/institutions.js";

export function createUserRoutes(userService: UserRegistrationService): Router {
  const router = Router();

  router.post("/api/users", (request, response, next) => {
    const input = parseRegistrationInput(request.body);
    if (!input) {
      response.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados de cadastro inválidos.",
        },
      });
      return;
    }

    void userService.register(input).then(
      (user) => {
        response.status(201).json({ data: { user } });
      },
      (error: unknown) => {
        if (error instanceof DuplicateEmailError) {
          response.status(409).json({
            error: {
              code: "EMAIL_ALREADY_EXISTS",
              message: "Já existe uma conta com este e-mail.",
            },
          });
          return;
        }

        next(error);
      },
    );
  });

  return router;
}

function parseRegistrationInput(value: unknown): RegisterUserInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const fullName = parseRequiredText(value.fullName, 160);
  const email = parseRequiredText(value.email, 320);
  const password = value.password;
  const cpf = parseOptionalText(value.cpf, 14);
  const cityUf = parseOptionalText(value.cityUf, 120);

  if (
    !fullName ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    Array.from(password).length < 8 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !isInstitutionId(value.institutionId) ||
    cpf === null ||
    cityUf === null
  ) {
    return null;
  }

  return {
    fullName,
    email,
    password,
    institutionId: value.institutionId,
    ...(cpf === undefined ? {} : { cpf }),
    ...(cityUf === undefined ? {} : { cityUf }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function parseOptionalText(
  value: unknown,
  maxLength: number,
): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.length <= maxLength ? trimmed : null;
}
