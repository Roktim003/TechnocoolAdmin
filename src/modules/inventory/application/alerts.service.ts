import type { ActorContext } from "@/modules/audit/application/audit.service";
import { ValidationError } from "@/shared/errors/app-error";
import { d, ZERO, type Dec } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import type { InventoryActor } from "./ports";

export interface AlertSettingsRecord {
  lowStockRoleIds: string[];
  digestEnabled: boolean;
  /** HH:mm in Asia/Dhaka. */
  digestTime: string;
}

export interface LowStockFilters {
  catalogId?: string;
  categoryId?: string;
  warehouseId?: string;
  q?: string;
}

export interface ProductAvailability {
  id: string;
  code: string;
  name: string;
  unitCode: string;
  catalogName: string;
  categoryName: string;
  status: string;
  minStockLevel: string | null;
  /** GOOD balances per warehouse. */
  balances: { warehouseId: string; onHand: string; reserved: string }[];
}

export interface LowStockRow {
  product: { id: string; code: string; name: string; unitCode: string; catalogName: string; categoryName: string };
  warehouses: { warehouseId: string; code: string; available: string }[];
  totalAvailable: string;
  minStockLevel: string;
  shortBy: string;
  /** 2 × minimum − available. */
  suggestedQty: string;
}

export interface AlertStore {
  settings(): Promise<AlertSettingsRecord>;
  updateSettings(data: Partial<AlertSettingsRecord>): Promise<AlertSettingsRecord>;
  roles(): Promise<{ id: string; name: string }[]>;
  /** Products with a minimum (or exactly `productIds`) and their GOOD balances. */
  products(f: LowStockFilters & { productIds?: string[] }): Promise<ProductAvailability[]>;
  warehouses(): Promise<{ id: string; code: string; name: string }[]>;
  /** Upserts and locks the product's low-stock state row (FOR UPDATE). */
  lockState(productId: string): Promise<{ isLow: boolean }>;
  setState(productId: string, isLow: boolean): Promise<void>;
}

export interface AlertUnitOfWork {
  store: AlertStore;
  transaction<T>(fn: (store: AlertStore) => Promise<T>): Promise<T>;
}

/** Delivery of alerts (notifications module). */
export interface AlertNotifier {
  lowStock(rows: LowStockRow[], roleIds: string[]): Promise<void>;
  /** Emails the digest; returns how many emails were queued. */
  digest(rows: LowStockRow[], roleIds: string[]): Promise<number>;
}

export interface DigestScheduler {
  schedule(s: AlertSettingsRecord): Promise<void>;
}

const q3 = (v: Dec) => v.toFixed(3);
const max0 = (v: Dec) => (v.lt(0) ? ZERO : v);

export class AlertService {
  constructor(
    private readonly d: {
      uow: AlertUnitOfWork;
      notifier: AlertNotifier;
      scheduler: DigestScheduler;
      audit: (actor: ActorContext, entry: { action: string; before: unknown; after: unknown }) => Promise<void>;
    },
  ) {}

  /** Low-stock rows. `scopeWarehouseIds` limits the per-warehouse columns; totals are company-wide unless one warehouse is chosen. */
  async rows(filters: LowStockFilters, scopeWarehouseIds: string[] | null): Promise<LowStockRow[]> {
    const [products, warehouses] = await Promise.all([this.d.uow.store.products(filters), this.d.uow.store.warehouses()]);
    return this.compute(products, warehouses, filters.warehouseId ?? null, scopeWarehouseIds).filter((r): r is LowStockRow => !!r);
  }

  private compute(products: ProductAvailability[], warehouses: { id: string; code: string }[], only: string | null, scope: string[] | null): (LowStockRow | null)[] {
    return products.map((p) => {
      if (!p.minStockLevel) return null;
      const min = d(p.minStockLevel);
      if (min.lte(0)) return null;
      const per = warehouses.map((w) => {
        const b = p.balances.find((x) => x.warehouseId === w.id);
        return { warehouseId: w.id, code: w.code, available: max0(d(b?.onHand).minus(d(b?.reserved))) };
      });
      const total = (only ? per.filter((w) => w.warehouseId === only) : per).reduce((a, w) => a.plus(w.available), ZERO);
      if (total.gte(min)) return null;
      return {
        product: { id: p.id, code: p.code, name: p.name, unitCode: p.unitCode, catalogName: p.catalogName, categoryName: p.categoryName },
        warehouses: per.filter((w) => !scope || scope.includes(w.warehouseId)).map((w) => ({ ...w, available: q3(w.available) })),
        totalAvailable: q3(total),
        minStockLevel: q3(min),
        shortBy: q3(min.minus(total)),
        suggestedQty: q3(max0(min.times(2).minus(total))),
      };
    });
  }

  async lowStock(actor: InventoryActor, filters: LowStockFilters): Promise<LowStockRow[]> {
    if (filters.warehouseId && !actor.warehouseIds.includes(filters.warehouseId)) throw InventoryErrors.outOfScope();
    return this.rows(filters, actor.warehouseIds);
  }

  /**
   * Fires a LOW_STOCK alert once when a product's total available GOOD stock crosses below its
   * minimum, and re-arms when it is back at or above the minimum. Runs in the worker after commit.
   */
  async checkCrossings(productIds: string[]): Promise<{ crossed: string[]; reset: string[] }> {
    const crossed: LowStockRow[] = [];
    const reset: string[] = [];
    const warehouses = await this.d.uow.store.warehouses();
    for (const productId of [...new Set(productIds)].sort()) {
      await this.d.uow.transaction(async (store) => {
        const state = await store.lockState(productId);
        const [p] = await store.products({ productIds: [productId] });
        const row = p ? this.compute([p], warehouses, null, null)[0] : null;
        const low = !!row && p!.status === "ACTIVE";
        if (low && !state.isLow) {
          await store.setState(productId, true);
          crossed.push(row!);
        } else if (!low && state.isLow) {
          await store.setState(productId, false);
          reset.push(productId);
        }
      });
    }
    if (crossed.length) await this.d.notifier.lowStock(crossed, (await this.d.uow.store.settings()).lowStockRoleIds);
    return { crossed: crossed.map((r) => r.product.id), reset };
  }

  /** The daily digest (worker): every product below its minimum, emailed to opted-in recipients. */
  async digest(): Promise<{ products: number; emailed: number }> {
    const settings = await this.d.uow.store.settings();
    if (!settings.digestEnabled) return { products: 0, emailed: 0 };
    const rows = (await this.rows({}, null)).sort((a, b) => d(b.shortBy).comparedTo(d(a.shortBy)));
    if (!rows.length) return { products: 0, emailed: 0 };
    return { products: rows.length, emailed: await this.d.notifier.digest(rows, settings.lowStockRoleIds) };
  }

  /* ── settings ── */

  async settings() {
    const [s, roles] = await Promise.all([this.d.uow.store.settings(), this.d.uow.store.roles()]);
    return { ...s, roles };
  }

  async updateSettings(actor: ActorContext, input: Partial<AlertSettingsRecord>) {
    if (input.lowStockRoleIds) {
      const known = new Set((await this.d.uow.store.roles()).map((r) => r.id));
      const bad = input.lowStockRoleIds.filter((id) => !known.has(id));
      if (bad.length) throw new ValidationError("Unknown role.", [{ path: "lowStockRoleIds", message: "One or more roles don't exist." }]);
    }
    const before = await this.d.uow.store.settings();
    const after = await this.d.uow.store.updateSettings({ ...input, ...(input.lowStockRoleIds ? { lowStockRoleIds: [...new Set(input.lowStockRoleIds)] } : {}) });
    await this.d.audit(actor, { action: "alert_settings.update", before, after });
    await this.d.scheduler.schedule(after);
    return this.settings();
  }
}
