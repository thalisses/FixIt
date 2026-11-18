import { isAuthorized } from "../auth/authorization.js";
import type { PublicSessionUser } from "./sessionService.js";
import type {
  MaintenanceReport,
  MaintenanceReportFilters,
  ReportRepository,
} from "../repositories/reportRepository.js";

export class ReportAccessDeniedError extends Error {
  constructor() {
    super("Você não tem permissão para acessar os relatórios.");
    this.name = "ReportAccessDeniedError";
  }
}

export interface ReportService {
  getMaintenanceReport(
    user: Pick<PublicSessionUser, "id" | "role">,
    filters?: MaintenanceReportFilters,
  ): Promise<MaintenanceReport>;
}

export function createReportService(repository: ReportRepository): ReportService {
  return {
    getMaintenanceReport(user, filters) {
      if (!isAuthorized(user, "reports:read")) {
        throw new ReportAccessDeniedError();
      }
      return repository.getMaintenanceReport(filters);
    },
  };
}
