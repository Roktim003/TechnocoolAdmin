import { NotFoundError } from "@/shared/errors/app-error";
import type { ListQuery } from "@/shared/pagination/list-query";
import { d, money } from "../domain/decimal";
import { InventoryErrors } from "../domain/errors";
import { available } from "../domain/rules";
import type { BalanceFilters, MovementFilters, SerialFilters } from "./dto";
import type { InventoryActor, InventoryUnitOfWork } from "./ports";

/** Read side: stock levels, product stock cards, availability, the ledger and serials. */
export class StockQueryService {
  constructor(private readonly d: { uow: InventoryUnitOfWork }) {}

  private get store() {
    return this.d.uow.store;
  }

  private scope(actor: InventoryActor, warehouseId?: string): string[] {
    if (!warehouseId) return actor.warehouseIds;
    if (!actor.warehouseIds.includes(warehouseId)) throw InventoryErrors.outOfScope();
    return [warehouseId];
  }

  async balances(actor: InventoryActor, query: ListQuery<BalanceFilters>) {
    const { items, total } = await this.store.stockLevels(query, this.scope(actor, query.filters.warehouseId));
    return {
      total,
      items: items.map((r) => {
        const onHand = d(r.good).plus(d(r.damaged));
        const totalQty = onHand.plus(d(r.inTransit));
        const availableQty = d(r.good).minus(d(r.reserved));
        return {
          product: r.product,
          warehouses: r.warehouses.map((w) => ({ ...w, available: d(w.good).minus(d(w.reserved)).toFixed(3) })),
          onHand: d(r.good).toFixed(3),
          reserved: d(r.reserved).toFixed(3),
          available: availableQty.toFixed(3),
          damaged: d(r.damaged).toFixed(3),
          inTransit: d(r.inTransit).toFixed(3),
          total: totalQty.toFixed(3),
          avgCost: r.avgCost,
          stockValue: money(totalQty.times(d(r.avgCost))).toFixed(2),
          belowMinimum: r.product.minStockLevel !== null && availableQty.lt(d(r.product.minStockLevel)),
        };
      }),
    };
  }

  async productStock(actor: InventoryActor, productId: string, query: ListQuery<MovementFilters>) {
    const [product] = await this.store.products([productId]);
    if (!product) throw new NotFoundError("Product");
    const level = await this.balances(actor, { page: 1, pageSize: 1, skip: 0, take: 1, sort: [{ field: "code", direction: "asc" }], filters: { productId } });
    const transit = await this.store.inTransitForProduct(productId, actor.warehouseIds);
    const ledger = await this.store.movements({ ...query, filters: { ...query.filters, productId } }, this.scope(actor, query.filters.warehouseId));
    return { product, level: level.items[0] ?? null, inTransit: transit, ledger };
  }

  async availability(actor: InventoryActor, productId: string, warehouseId: string) {
    this.scope(actor, warehouseId);
    const keys = (["GOOD", "DAMAGED"] as const).map((condition) => ({ productId, warehouseId, condition }));
    const b = await this.store.balances(keys);
    const good = b.get(`${productId}|${warehouseId}|GOOD`);
    const damaged = b.get(`${productId}|${warehouseId}|DAMAGED`);
    const cost = (await this.store.costs([productId])).get(productId);
    return {
      productId,
      warehouseId,
      onHand: d(good?.qtyOnHand).toFixed(3),
      reserved: d(good?.qtyReserved).toFixed(3),
      available: available(good?.qtyOnHand ?? "0", good?.qtyReserved ?? "0"),
      damaged: d(damaged?.qtyOnHand).toFixed(3),
      damagedReserved: d(damaged?.qtyReserved).toFixed(3),
      damagedAvailable: available(damaged?.qtyOnHand ?? "0", damaged?.qtyReserved ?? "0"),
      avgCost: cost?.avgCost ?? "0.0000",
    };
  }

  movements(actor: InventoryActor, query: ListQuery<MovementFilters>) {
    return this.store.movements(query, this.scope(actor, query.filters.warehouseId));
  }

  /** Warehouse-scoped like the serial report: in the user's warehouses, or out of stock after passing through one. */
  listSerials(actor: InventoryActor, query: ListQuery<SerialFilters>) {
    return this.store.listSerials(query, this.scope(actor, query.filters.warehouseId));
  }

  async serial(actor: InventoryActor, id: string) {
    const [s] = await this.store.serialsById([id]);
    if (!s) throw new NotFoundError("Serial number");
    const list = await this.store.listSerials({ page: 1, pageSize: 1, skip: 0, take: 1, sort: [{ field: "serial", direction: "asc" }], q: s.serial, filters: { productId: s.productId } }, actor.warehouseIds);
    // Object-level authorization: a serial of another warehouse is refused, not shown.
    if (!list.items.some((x) => x.id === id)) throw InventoryErrors.outOfScope();
    return { serial: list.items.find((x) => x.id === id) ?? { ...s, productCode: "", productName: "", warehouseCode: null, projectCode: null, customerName: null }, history: await this.store.serialHistory(id) };
  }
}
