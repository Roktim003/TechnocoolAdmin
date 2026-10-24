import { netCost, netQty, summarize, zeroCosts, type ProjectSummary } from "../domain/rules";
import type { InventoryProjectQuery, ProjectRecord, ProjectsStore } from "./ports";

export interface MaterialProduct {
  productId: string;
  product: { code: string; name: string; unitCode: string; trackSerial: boolean };
  issuedQty: string;
  returnedQty: string;
  returnedDamagedQty: string;
  netQty: string;
  issuedCost: string;
  returnedCost: string;
  netCost: string;
  serialsAtSite: string[];
}

/**
 * The one place project figures are calculated (API, pages, the cost statement PDF, alerts
 * and — later — reports). Material comes from the stock ledger through inventory's query
 * interface: posted issues minus posted returns, at the unit costs recorded when they posted.
 */
export class ProjectCostingService {
  constructor(private readonly d: { store: () => ProjectsStore; stock: InventoryProjectQuery }) {}

  /** Summary totals for many projects at once (list pages). */
  async summaries(projects: Pick<ProjectRecord, "id" | "contractValue">[]): Promise<Map<string, ProjectSummary>> {
    const ids = projects.map((p) => p.id);
    const [material, costs] = await Promise.all([this.d.stock.material(ids), this.d.store().costTotals(ids)]);
    const out = new Map<string, ProjectSummary>();
    for (const p of projects) out.set(p.id, summarize(material.filter((m) => m.projectId === p.id), costs.get(p.id) ?? zeroCosts(), p.contractValue));
    return out;
  }

  async summary(project: Pick<ProjectRecord, "id" | "contractValue">): Promise<ProjectSummary> {
    return (await this.summaries([project])).get(project.id)!;
  }

  /** Material per product, with the serial numbers still at the site. */
  async material(projectId: string): Promise<MaterialProduct[]> {
    const [rows, serials] = await Promise.all([this.d.stock.material([projectId]), this.d.stock.serialsAtSite(projectId)]);
    return rows.map((r) => ({
      productId: r.productId,
      product: r.product,
      issuedQty: r.issuedQty,
      returnedQty: r.returnedQty,
      returnedDamagedQty: r.returnedDamagedQty,
      netQty: netQty(r),
      issuedCost: r.issuedCost,
      returnedCost: r.returnedCost,
      netCost: netCost(r),
      serialsAtSite: serials.filter((s) => s.productId === r.productId).map((s) => s.serial),
    }));
  }
}
