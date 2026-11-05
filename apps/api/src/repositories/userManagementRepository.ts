import type { DataSource, EntityManager } from "typeorm";
import { User, UserRole } from "../entities/User.js";
import type {
  UserManagementRepository,
  UserManagementTransaction,
} from "../services/userManagementService.js";

export function createUserManagementRepository(
  dataSource: DataSource,
): UserManagementRepository {
  return {
    async list(page, pageSize) {
      const [users, totalItems] = await dataSource.getRepository(User).findAndCount({
        select: {
          id: true,
          fullName: true,
          email: true,
          institutionId: true,
          role: true,
        },
        order: { createdAt: "DESC", id: "ASC" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return { users, totalItems };
    },

    transaction(work) {
      return dataSource.transaction((entityManager) => {
        const repository = entityManager.getRepository(User);
        const transaction: UserManagementTransaction = {
          lockRoleChanges: async () => {
            await lockUserRoleChanges(entityManager);
          },
          getActiveManagers: () =>
            repository
              .createQueryBuilder("user")
              .select("user.id")
              .where("user.role = :role", { role: UserRole.GESTOR })
              .andWhere("user.isActive = :isActive", { isActive: true })
              .orderBy("user.id", "ASC")
              .setLock("pessimistic_write")
              .getMany(),
          findByIdForUpdate: (userId) =>
            repository.findOne({
              where: { id: userId },
              lock: { mode: "pessimistic_write" },
            }),
          save: (user) => repository.save(user),
        };
        return work(transaction);
      });
    },
  };
}

export async function lockUserRoleChanges(
  entityManager: EntityManager,
): Promise<void> {
  await entityManager.query(
    "SELECT pg_advisory_xact_lock(hashtext('fixit:user-role-changes')::bigint)",
  );
}
