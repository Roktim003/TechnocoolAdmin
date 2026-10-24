import type { ParamDef } from "../../domain/types";

/** Filters shared by several reports (keys are the URL / schedule parameter names). */
export const P = {
  dateFrom: (dflt = "monthStart"): ParamDef => ({ key: "dateFrom", label: "From", kind: "dateFrom", default: dflt }),
  dateTo: (dflt = "today"): ParamDef => ({ key: "dateTo", label: "To", kind: "dateTo", default: dflt }),
  warehouse: { key: "warehouseId", label: "Warehouse", kind: "warehouse" } as ParamDef,
  brand: { key: "catalogId", label: "Brand", kind: "catalog" } as ParamDef,
  category: { key: "categoryId", label: "Category", kind: "category" } as ParamDef,
  product: { key: "productId", label: "Product", kind: "product" } as ParamDef,
  project: { key: "projectId", label: "Project", kind: "project" } as ParamDef,
  supplier: { key: "supplierId", label: "Supplier", kind: "supplier" } as ParamDef,
  customer: { key: "customerId", label: "Customer", kind: "customer" } as ParamDef,
  user: { key: "userId", label: "User", kind: "user" } as ParamDef,
  q: (placeholder: string, label = "Search"): ParamDef => ({ key: "q", label, kind: "text", placeholder }),
};
