import { BusinessRuleError, ConflictError, ValidationError } from "@/shared/errors/app-error";

export const CatalogErrors = {
  codeTaken: (code: string) => new ConflictError(`Code '${code}' is already used by another product.`, [{ path: "code", message: "This code is already in use." }]),
  barcodeTaken: (barcode: string) =>
    new ConflictError(`Barcode '${barcode}' is already used by another product.`, [{ path: "barcode", message: "This barcode is already in use." }]),
  codeImmutable: () => new BusinessRuleError("A product's code can't be changed after it is created.", "CODE_IMMUTABLE"),
  catalogNameTaken: (name: string) => new ConflictError(`A catalog named '${name}' already exists.`, [{ path: "name", message: "Catalog name is already taken." }]),
  categoryNameTaken: (name: string) => new ConflictError(`A category named '${name}' already exists.`, [{ path: "name", message: "Category name is already taken." }]),
  unitCodeTaken: (code: string) => new ConflictError(`A unit with code '${code}' already exists.`, [{ path: "code", message: "Unit code is already taken." }]),
  unknownCatalog: () => new BusinessRuleError("The selected catalog does not exist.", "UNKNOWN_CATALOG"),
  unknownCategory: () => new BusinessRuleError("The selected category does not exist.", "UNKNOWN_CATEGORY"),
  unknownUnit: () => new BusinessRuleError("The selected unit does not exist.", "UNKNOWN_UNIT"),
  unknownSupplier: () => new BusinessRuleError("The selected default supplier does not exist.", "UNKNOWN_SUPPLIER"),
  inactiveSupplier: (name: string) => new BusinessRuleError(`Supplier '${name}' is inactive.`, "INACTIVE_SUPPLIER"),
  inactiveCatalog: (name: string) => new BusinessRuleError(`Catalog '${name}' is inactive. Choose an active catalog.`, "INACTIVE_CATALOG"),
  inactiveCategory: (name: string) => new BusinessRuleError(`Category '${name}' is inactive. Choose an active category.`, "INACTIVE_CATEGORY"),
  inactiveUnit: (code: string) => new BusinessRuleError(`Unit '${code}' is inactive. Choose an active unit.`, "INACTIVE_UNIT"),
  purchaseUnitIncomplete: () =>
    new BusinessRuleError("Set both the purchase unit and its conversion factor, or neither.", "PURCHASE_UNIT_INCOMPLETE"),
  purchaseFactorInvalid: () => new BusinessRuleError("The purchase unit conversion factor must be greater than 0.", "PURCHASE_FACTOR_INVALID"),
  purchaseCostRequired: () => new ValidationError("Purchase cost is required.", [{ path: "purchaseCost", message: "Purchase cost is required." }]),
  catalogInUse: (count: number) =>
    new BusinessRuleError(`This catalog has ${count} product${count === 1 ? "" : "s"}. Deactivate it instead of deleting.`, "CATALOG_IN_USE"),
  categoryInUse: (count: number) =>
    new BusinessRuleError(`This category is used by ${count} product${count === 1 ? "" : "s"}. Deactivate it instead of deleting.`, "CATEGORY_IN_USE"),
  photoLimit: (max: number) => new BusinessRuleError(`A product can have at most ${max} photos.`, "PHOTO_LIMIT"),
  alreadyDiscontinued: () => new BusinessRuleError("This product is already discontinued.", "ALREADY_DISCONTINUED"),
  alreadyActive: () => new BusinessRuleError("This product is already active.", "ALREADY_ACTIVE"),
};
