import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { PurchasingErrors } from "../domain/errors";
import { formatSupplierCode } from "../domain/types";
import type { CreateSupplierInput, SupplierFilters, UpdateSupplierInput } from "./dto";
import type { PurchasingActor, PurchasingUnitOfWork, SupplierRecord, SupplierWrite } from "./ports";

/** Names compare case- and whitespace-insensitively (same rule as the other masters). */
export const supplierKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const opt = <T>(v: T | undefined | null) => (v === undefined ? null : v);
const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const snapshot = ({ openPoCount: _o, ...s }: SupplierRecord) => s;

/** Supplier master (extends the Module 2 one): codes SUP-001…, brands, payment terms. */
export class SupplierService {
  constructor(private readonly d: { uow: PurchasingUnitOfWork }) {}

  private get store() {
    return this.d.uow.store;
  }

  list(q: ListQuery<SupplierFilters>) {
    return this.store.listSuppliers(q);
  }

  async get(id: string): Promise<SupplierRecord> {
    const s = await this.store.supplier(id);
    if (!s) throw new NotFoundError("Supplier");
    return s;
  }

  async detail(id: string) {
    const supplier = await this.get(id);
    return { supplier, stats: await this.store.supplierStats(id) };
  }

  async create(actor: PurchasingActor, input: CreateSupplierInput): Promise<SupplierRecord> {
    if (await this.store.supplierNameExists(supplierKey(input.name))) throw PurchasingErrors.nameTaken(input.name);
    const data: SupplierWrite = {
      name: input.name.trim(),
      type: input.type,
      defaultCurrency: input.defaultCurrency ?? input.currency ?? (input.type === "FOREIGN" ? "USD" : "BDT"),
      contactPerson: opt(input.contactPerson),
      phone: opt(input.phone),
      email: opt(input.email),
      address: opt(input.address),
      brandsSupplied: opt(input.brandsSupplied),
      paymentTermsNote: opt(input.paymentTermsNote),
      notes: opt(input.notes),
    };
    return this.d.uow.transaction(async (store) => {
      const code = formatSupplierCode(await store.nextNumber("SUPPLIER", "ALL"));
      const s = await store.createSupplier({ ...data, code, nameKey: supplierKey(input.name) });
      await store.audit.record(actor, { action: "supplier.create", entityType: "Supplier", entityId: s.id, after: snapshot(s) });
      return s;
    });
  }

  async update(actor: PurchasingActor, id: string, input: UpdateSupplierInput): Promise<SupplierRecord> {
    const before = await this.get(id);
    if (input.name !== undefined && (await this.store.supplierNameExists(supplierKey(input.name), id))) throw PurchasingErrors.nameTaken(input.name);
    const { currency, defaultCurrency, name, ...rest } = input;
    return this.d.uow.transaction(async (store) => {
      const s = await store.updateSupplier(
        id,
        defined({ ...rest, name: name?.trim(), nameKey: name !== undefined ? supplierKey(name) : undefined, defaultCurrency: defaultCurrency ?? currency }),
      );
      const action = input.isActive === false ? "supplier.deactivate" : input.isActive === true && !before.isActive ? "supplier.reactivate" : "supplier.update";
      await store.audit.record(actor, { action, entityType: "Supplier", entityId: id, before: snapshot(before), after: snapshot(s) });
      return s;
    });
  }

  deactivate(actor: PurchasingActor, id: string) {
    return this.update(actor, id, { isActive: false });
  }
}
