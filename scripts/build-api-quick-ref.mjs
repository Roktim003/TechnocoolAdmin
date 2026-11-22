// Builds docs/api/TechnoCool-API-Mobile-Quick.md from the full mobile API reference
// (docs/api/StockBook-API-Mobile.md). Run after the full reference is regenerated:
//
//   node scripts/build-api-quick-ref.mjs
//
// The quick reference keeps every endpoint's tables (auth, parameters, request body, status codes)
// and its first example, shortens lists inside example JSON to their first item, and replaces a
// long response that repeats an earlier one with a pointer to it.
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "docs/api/StockBook-API-Mobile.md";
const TARGET = "docs/api/TechnoCool-API-Mobile-Quick.md";
const ENDPOINT = /^#### (GET|POST|PUT|PATCH|DELETE) (\/\S*) — (.*)$/;
const EXAMPLE = /^\*\*Example (\d+)? ?: /;
/** Responses longer than this many lines are replaced by a pointer when their shape was already shown. */
const REPEAT_MIN_LINES = 40;

const lines = readFileSync(SOURCE, "utf8").split(/\r?\n/);

/** Marks every list so the printer can keep one item and say how many were left out. */
function shorten(value) {
  if (Array.isArray(value)) return { __list: value.slice(0, 1).map(shorten), more: Math.max(0, value.length - 1) };
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v)]));
  }
  return value;
}

function print(value, indent) {
  const pad = "  ".repeat(indent);
  if (value && value.__list) {
    if (value.__list.length === 0) return "[]";
    const item = pad + "  " + print(value.__list[0], indent + 1);
    const more = value.more > 0 ? `,\n${pad}  // … ${value.more} more` : "";
    return `[\n${item}${more}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return "{\n" + keys.map((k) => `${pad}  ${JSON.stringify(k)}: ${print(value[k], indent + 1)}`).join(",\n") + `\n${pad}}`;
  }
  return JSON.stringify(value);
}

/** The top-level field names of a record (or of a list's first record): the same names mean the same kind of record. */
function shapeOf(value) {
  if (Array.isArray(value)) return "[" + (value.length ? shapeOf(value[0]) : "") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().join(",") + "}";
  return "";
}

const shapesSeen = new Map();

/** Shortens the JSON body of one fenced block (given without its fences). */
function shortenBlock(block, endpoint, isResponse) {
  const start = block.findIndex((l) => l.startsWith("{") || l.startsWith("["));
  if (start < 0) return block;
  let parsed;
  try {
    parsed = JSON.parse(block.slice(start).join("\n"));
  } catch {
    return block;
  }
  const body = print(shorten(parsed), 0).split("\n");
  if (isResponse && parsed && typeof parsed === "object" && parsed.data && typeof parsed.data === "object") {
    const shape = shapeOf(Array.isArray(parsed.data) ? parsed.data.slice(0, 1) : parsed.data);
    const first = shapesSeen.get(shape);
    if (first && first !== endpoint && body.length > REPEAT_MIN_LINES) {
      const data = Array.isArray(parsed.data) ? `[ /* same record as in ${first} */ ]` : `{ /* same record as in ${first} */ }`;
      const meta = parsed.meta ? `,\n  "meta": ${print(shorten(parsed.meta), 1)}` : "";
      return block.slice(0, start).concat(`{\n  "data": ${data}${meta}\n}`.split("\n"));
    }
    if (!first) shapesSeen.set(shape, endpoint);
  }
  return block.slice(0, start).concat(body);
}

const body = [];
const index = [];
let section = "";
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const match = ENDPOINT.exec(line);
  if (!match) {
    if (line.startsWith("## ")) section = line.slice(3);
    body.push(line);
    i++;
    continue;
  }
  const endpoint = `${match[1]} ${match[2]}`;
  index.push({ section, method: match[1], path: match[2], purpose: match[3] });

  let end = i + 1;
  while (end < lines.length && !/^#{1,4} /.test(lines[end])) end++;
  const block = lines.slice(i, end);
  const examples = [];
  block.forEach((l, k) => {
    if (EXAMPLE.test(l)) examples.push(k);
  });
  body.push(...(examples.length ? block.slice(0, examples[0]) : block));

  if (examples.length) {
    const example = block.slice(examples[0], examples[1] ?? block.length);
    let isResponse = false;
    let k = 0;
    while (k < example.length) {
      const l = example[k];
      if (l.startsWith("```")) {
        let close = k + 1;
        while (close < example.length && !example[close].startsWith("```")) close++;
        body.push(l, ...shortenBlock(example.slice(k + 1, close), endpoint, isResponse), "```");
        k = close + 1;
        continue;
      }
      if (l === "*Response*") isResponse = true;
      body.push(l.replace(EXAMPLE, "**Example: "));
      k++;
    }
    const others = examples.slice(1).map((x) => block[x].replace(EXAMPLE, "").replace(/\*\*$/, "").trim());
    if (others.length) body.push(`*More examples in the full reference:* ${others.join(" · ")}`, "");
  }
  i = end;
}

// Replace the source's title block (everything before "## 1.") with the quick reference's own.
const firstSection = body.findIndex((l) => l.startsWith("## "));
const head = [
  "# TechnoCool Inventory API: mobile quick reference",
  "",
  "Every `/api/v1` endpoint for the Android and iOS apps: URL, who may call it, parameters, request body, status codes and one real request and response.",
  "",
  "- **Base URL:** `https://<your-domain>/api/v1` (local: `http://localhost:3000/api/v1`). Paths below are relative to it.",
  "- **Auth:** `POST /auth/login` with `\"client\": \"mobile\"` returns a JWT access token (15 minutes) and a refresh token (30 days). Send `Authorization: Bearer <accessToken>` on every other call. Details in section 3.",
  "- **Name:** the product is TechnoCool Inventory; \"StockBook\" in this file is its code name.",
  "- **Examples are shortened:** a list in example JSON shows its first item and `// … N more`; a long response that repeats an earlier one says `same record as in <endpoint>`. Each endpoint has one example here.",
  "- **Full reference:** [StockBook-API-Mobile.md](StockBook-API-Mobile.md) has every example (errors, other roles) with complete JSON. The live spec is `GET /api/v1/openapi.json` (Swagger UI at `/api/docs`).",
  "",
  `## All ${index.length} endpoints`,
  "",
];
let current = "";
for (const e of index) {
  if (e.section !== current) {
    current = e.section;
    head.push(`**${current}**`, "", "| Method | URL | Purpose |", "|---|---|---|");
  }
  head.push(`| ${e.method} | \`${e.path}\` | ${e.purpose.replace(/\|/g, "\\|")} |`);
  const next = index[index.indexOf(e) + 1];
  if (!next || next.section !== current) head.push("");
}

const out = head.concat(body.slice(firstSection)).join("\n").replace(/\n{3,}/g, "\n\n");
writeFileSync(TARGET, out.endsWith("\n") ? out : out + "\n");
console.log(`${TARGET}: ${index.length} endpoints, ${out.split("\n").length} lines`);
