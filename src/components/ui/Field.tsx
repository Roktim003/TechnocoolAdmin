import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  error?: string;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, error, helper, children, className }: FieldShellProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: ReactNode;
  error?: string;
  helper?: ReactNode;
  mono?: boolean;
  fieldClassName?: string;
}

export function TextField({ label, error, helper, mono, fieldClassName, className, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} helper={helper} className={fieldClassName}>
      <input
        id={id}
        className={[styles.input, error ? styles.invalid : "", mono ? styles.mono : "", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: ReactNode;
  error?: string;
  helper?: ReactNode;
  fieldClassName?: string;
  /** Hide the label visually (still read by screen readers). */
  hideLabel?: boolean;
}

export function SelectField({ label, error, helper, fieldClassName, hideLabel, className, children, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={hideLabel ? <span className="visually-hidden">{label}</span> : label} error={error} helper={helper} className={fieldClassName}>
      <select
        id={id}
        className={[styles.input, styles.select, error ? styles.invalid : "", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> {
  label: ReactNode;
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className={[styles.checkboxRow, className].filter(Boolean).join(" ")}>
      <input id={id} type="checkbox" className={styles.checkbox} {...props} />
      <label htmlFor={id} className={styles.checkboxLabel}>
        {label}
      </label>
    </div>
  );
}

/** A group label + error for sets of checkboxes. */
export function FieldGroup({ legend, error, children }: { legend: ReactNode; error?: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group} aria-invalid={error ? true : undefined}>
      <legend className={styles.label}>{legend}</legend>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: ReactNode;
  error?: string;
  helper?: ReactNode;
  fieldClassName?: string;
}

export function TextAreaField({ label, error, helper, fieldClassName, className, rows = 4, ...props }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} helper={helper} className={fieldClassName}>
      <textarea
        id={id}
        rows={rows}
        className={[styles.input, styles.textarea, error ? styles.invalid : "", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export interface ToggleProps {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  disabled?: boolean;
}

/** Carbon-style toggle switch (role="switch"). */
export function Toggle({ label, checked, onChange, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className={styles.toggleRow}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.toggleKnob} />
      </button>
      <div>
        <label htmlFor={id} className={styles.toggleLabel}>
          {label} <span className={styles.toggleState}>{checked ? "On" : "Off"}</span>
        </label>
        {description ? (
          <p id={`${id}-desc`} className={styles.helper}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
