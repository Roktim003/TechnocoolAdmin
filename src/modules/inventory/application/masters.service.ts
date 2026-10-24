import type { ActorContext } from "@/modules/audit/application/audit.service";
import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { InventoryErrors } from "../domain/errors";
import type { MasterFilters } from "./dto";
import type { Customer, InventorySettings, InventoryUnitOfWork, WarehouseRef } from "./ports";

const key = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

type CustomerInput = { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null };

const opt = <T>(v: T | undefined | null) => (v === undefined ? null : v);
/** Keeps only the keys that were sent (PATCH semantics). */
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Customers (minimal master). Suppliers moved to purchasing (Module 4), projects to the projects module (Module 5). */
export class MastersService {
  constructor(private readonly d: { uow: InventoryUnitOfWork }) {}

  private get store() {
    return this.d.uow.store;
  }

  /* ── customers ── */
  listCustomers(q: ListQuery<MasterFilters>) {
    return this.store.listCustomers(q);
  }
  async getCustomer(id: string) {
    const c = await this.store.customer(id);
    if (!c) throw new NotFoundError("Customer");
    return c;
  }
  async createCustomer(actor: ActorContext, input: CustomerInput): Promise<Customer> {
    if (await this.store.customerNameExists(key(input.name))) throw InventoryErrors.nameTaken("customer", input.name);
    return this.d.uow.transaction(async (store) => {
      const c = await store.createCustomer({ name: input.name.trim(), nameKey: key(input.name), contactPerson: opt(input.contactPerson), phone: opt(input.phone), email: opt(input.email), address: opt(input.address) });
      await store.audit.record(actor, { action: "customer.create", entityType: "Customer", entityId: c.id, after: c });
      return c;
    });
  }
  async updateCustomer(actor: ActorContext, id: string, input: Partial<CustomerInput> & { isActive?: boolean }): Promise<Customer> {
    const before = await this.getCustomer(id);
    if (input.name !== undefined && (await this.store.customerNameExists(key(input.name), id))) throw InventoryErrors.nameTaken("customer", input.name);
    return this.d.uow.transaction(async (store) => {
      const c = await store.updateCustomer(id, defined({ ...input, name: input.name?.trim(), nameKey: input.name !== undefined ? key(input.name) : undefined }));
      await store.audit.record(actor, { action: input.isActive === false ? "customer.deactivate" : "customer.update", entityType: "Customer", entityId: id, before, after: c });
      return c;
    });
  }

  /** All warehouses (any user may transfer to any of them). */
  warehouses(): Promise<WarehouseRef[]> {
    return this.store.warehouses();
  }

  /* ── settings ── */
  settings(): Promise<InventorySettings> {
    return this.store.settings();
  }
  async updateSettings(actor: ActorContext, input: Partial<Omit<InventorySettings, "fiscalYearStartMonth">>): Promise<InventorySettings> {
    return this.d.uow.transaction(async (store) => {
      const before = await store.settings();
      const after = await store.updateSettings(defined(input));
      await store.audit.record(actor, { action: "inventory_settings.update", entityType: "InventorySettings", entityId: null, before, after });
      return after;
    });
  }
}
