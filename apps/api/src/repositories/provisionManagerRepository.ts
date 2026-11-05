import type { DataSource } from "typeorm";
import { User, UserRole } from "../entities/User.js";
import type {
  ProvisionManagerRepository,
  ProvisionManagerTransaction,
} from "../services/provisionManagerService.js";
import { lockUserRoleChanges } from "./userManagementRepository.js";

export function createProvisionManagerRepository(
  dataSource: DataSource,
): ProvisionManagerRepository {
  return {
    transaction(work) {
      return dataSource.transaction(async (entityManager) => {
        await lockUserRoleChanges(entityManager);
        const repository = entityManager.getRepository(User);
        const transaction: ProvisionManagerTransaction = {
          findActiveManager: () =>
            repository.findOne({
              where: { role: UserRole.GESTOR, isActive: true },
              lock: { mode: "pessimistic_write" },
            }),
          findByEmailForUpdate: (email) =>
            repository
              .createQueryBuilder("user")
              .where("lower(trim(user.email)) = :email", { email })
              .setLock("pessimistic_write")
              .getOne(),
          save: (user) => repository.save(user),
        };
        return work(transaction);
      });
    },
  };
}
