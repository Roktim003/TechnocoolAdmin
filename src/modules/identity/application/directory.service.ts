import type { Principal } from "@/shared/auth/principal";
import type { ListQuery } from "@/shared/pagination/list-query";
import { hasPermission } from "@/shared/rbac/guards";
import type { Warehouse } from "../domain/types";
import type { LoginHistoryFilters } from "./dto";
import type { UnitOfWork } from "./ports";

/** Read-only lookups: warehouses and login history. */
export class DirectoryService {
  constructor(private readonly d: { uow: UnitOfWork }) {}

  /** User administrators see every warehouse; everyone else sees only the ones they are scoped to. */
  async listWarehouses(principal: Principal): Promise<Warehouse[]> {
    const all = await this.d.uow.repos.warehouses.list();
    return hasPermission(principal, "users", "FULL") ? all : all.filter((w) => principal.warehouseIds.includes(w.id));
  }

  listLoginHistory(query: ListQuery<LoginHistoryFilters>) {
    return this.d.uow.repos.loginHistory.list(query);
  }
}
