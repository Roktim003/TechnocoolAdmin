import { Notification } from "./Notification";

/**
 * Summary of everything to fix, shown at the top of a form after a submit attempt.
 * `problems` maps field keys to messages; `labels` turns a key into the field's name.
 */
export function FormProblems({ problems, labels, title }: { problems: Record<string, string>; labels?: Record<string, string>; title?: string }) {
  const entries = Object.entries(problems);
  if (!entries.length) return null;
  return (
    <Notification kind="error" title={title ?? (entries.length === 1 ? "1 thing to fix before saving" : `${entries.length} things to fix before saving`)}>
      <ul style={{ margin: "var(--s-1) 0 0", paddingLeft: "1.1em" }}>
        {entries.map(([k, m]) => (
          <li key={k}>
            {labels?.[k] ? <strong>{labels[k]}: </strong> : null}
            {m}
          </li>
        ))}
      </ul>
    </Notification>
  );
}
