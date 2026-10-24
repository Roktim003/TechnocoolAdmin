import { d } from "./decimal";
import { InventoryErrors } from "./errors";
import type { Condition, EntryStatus, EntryType, ProjectStatus } from "./types";

export const EDITABLE: EntryStatus[] = ["DRAFT", "REJECTED"];
export const CANCELLABLE: EntryStatus[] = ["DRAFT", "PENDING", "REJECTED"];

export function assertEditable(status: EntryStatus): void {
  if (!EDITABLE.includes(status)) throw InventoryErrors.notEditable(status);
}

/** Issues need a project that is still being planned or built; returns only need it not closed. */
export function assertProjectStatus(type: EntryType, project: { code: string; status: ProjectStatus; isActive: boolean }): void {
  if (type === "ISSUE_TO_PROJECT" && !["PLANNING", "RUNNING"].includes(project.status)) {
    const why: Record<string, string> = {
      ON_HOLD: "materials can't be issued while it is on hold (resume it first)",
      COMPLETED: "materials can't be issued to a completed project (reopen it first)",
      CLOSED: "materials can't be issued to a closed project",
    };
    throw InventoryErrors.projectStatus(project.code, project.status, why[project.status] ?? "materials can only be issued to planning or running projects");
  }
  if (type === "RETURN_FROM_SITE" && project.status === "CLOSED") {
    throw InventoryErrors.projectStatus(project.code, project.status, "returns are not accepted for closed projects");
  }
  if (type === "ISSUE_TO_PROJECT" && !project.isActive) throw InventoryErrors.inactive("Project", project.code);
}

/** DAMAGED lines: only returns from site (goods coming back damaged) and outs that clear damaged stock. */
export function assertCondition(type: EntryType, condition: Condition): void {
  if (condition === "GOOD") return;
  if (["ISSUE_TO_PROJECT", "SALE", "TRANSFER"].includes(type)) throw InventoryErrors.damagedNotAllowed();
  if (!["RETURN_FROM_SITE", "DAMAGE_WRITE_OFF", "RETURN_TO_SUPPLIER"].includes(type)) throw InventoryErrors.conditionNotAllowed();
}

/** Discontinued products can still be returned, written off or sent back; nothing else. */
export function allowsDiscontinued(type: EntryType): boolean {
  return ["RETURN_FROM_SITE", "RETURN_TO_SUPPLIER", "DAMAGE_WRITE_OFF", "REVERSAL"].includes(type);
}

/** Serial-tracked lines need a whole quantity and exactly that many serials. */
export function assertSerialCount(code: string, qty: string, serials: string[]): void {
  const q = d(qty);
  if (!q.isInteger()) throw InventoryErrors.serialFractional(code);
  if (!q.eq(serials.length)) throw InventoryErrors.serialCount(code, q.toFixed(0), serials.length);
}

export function normalizeSerial(s: string): string {
  return s.trim().toUpperCase();
}

/** Available = on hand − reserved by others. */
export function available(onHand: string, reserved: string, ownReservation = "0"): string {
  return d(onHand).minus(d(reserved)).plus(d(ownReservation)).toFixed(3);
}
