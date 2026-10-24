/** Projects domain vocabulary. Money and quantities are decimal strings (never floats). */

export const PROJECT_STATUSES = ["PLANNING", "RUNNING", "ON_HOLD", "COMPLETED", "CLOSED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  RUNNING: "Running",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};

export const PROJECT_TYPES = ["OFFICE", "HOSPITAL", "INSTITUTION", "RETAIL", "INDUSTRIAL", "RESIDENTIAL", "OTHER"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  OFFICE: "Office",
  HOSPITAL: "Hospital",
  INSTITUTION: "Institution",
  RETAIL: "Retail",
  INDUSTRIAL: "Industrial",
  RESIDENTIAL: "Residential",
  OTHER: "Other",
};

export const COST_CATEGORIES = ["LABOUR", "TRANSPORT", "OTHER"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = { LABOUR: "Labour", TRANSPORT: "Transport", OTHER: "Other" };

/** Who may make a status change: projects CREATE, projects FULL, or the built-in Admin role. */
export type TransitionLevel = "CREATE" | "FULL" | "ADMIN";

export interface Transition {
  from: ProjectStatus;
  to: ProjectStatus;
  level: TransitionLevel;
  /** A reason must be given (and is kept in the status history). */
  reason: boolean;
  label: string;
}

/** The only allowed status changes. Anything else is 422 INVALID_TRANSITION. */
export const TRANSITIONS: readonly Transition[] = [
  { from: "PLANNING", to: "RUNNING", level: "CREATE", reason: false, label: "Start (running)" },
  { from: "RUNNING", to: "ON_HOLD", level: "CREATE", reason: true, label: "Put on hold" },
  { from: "ON_HOLD", to: "RUNNING", level: "CREATE", reason: true, label: "Resume" },
  { from: "RUNNING", to: "COMPLETED", level: "CREATE", reason: false, label: "Mark completed" },
  { from: "COMPLETED", to: "RUNNING", level: "FULL", reason: true, label: "Reopen" },
  { from: "COMPLETED", to: "CLOSED", level: "FULL", reason: true, label: "Close" },
  { from: "CLOSED", to: "COMPLETED", level: "ADMIN", reason: true, label: "Undo close (back to completed)" },
];

export const transition = (from: ProjectStatus, to: ProjectStatus) => TRANSITIONS.find((t) => t.from === from && t.to === to);

/** Material can be issued only to these (Module 2 enforces it on every issue). */
export const ISSUE_STATUSES: readonly ProjectStatus[] = ["PLANNING", "RUNNING"];
/** Returns from site are accepted until the project is closed. */
export const RETURN_STATUSES: readonly ProjectStatus[] = ["PLANNING", "RUNNING", "ON_HOLD", "COMPLETED"];
/** Starting status of a new project. */
export const START_STATUSES: readonly ProjectStatus[] = ["PLANNING", "RUNNING"];

/** Cost-used thresholds that alert seeMargin users (once each; re-armed when cost falls below). */
export const ALERT_THRESHOLDS = [90, 100] as const;

/** PRJ-001 */
export const formatProjectCode = (n: number) => `PRJ-${String(n).padStart(3, "0")}`;
