/*
 * One JSON line per event: readable in a terminal, searchable in Render / Railway / any log viewer.
 * Links are logged without their query string or credentials: signed video URLs and page
 * links often carry tokens, session ids or expiry signatures that must not end up in logs.
 */

const SECRET_KEYS = /^(authorization|cookie|set-cookie|token|relaytoken|password|secret)$/i;

export function redactUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return value.replace(/\?.*$/, "?…");
  }
}

// Also scrubs links that appear inside error messages (e.g. "fetch failed for https://…?sig=…").
const scrubText = (text) => (typeof text === "string" ? text.replace(/(https?:\/\/[^\s?"']+)\?[^\s"']*/g, "$1?…") : text);

function serialize(key, value) {
  if (SECRET_KEYS.test(key)) return "[redacted]";
  if (value instanceof Error) {
    return { name: value.name, message: scrubText(value.message), status: value.status, stack: scrubText(value.stack?.split("\n").slice(0, 6).join("\n")) };
  }
  if (/url$|^page$/i.test(key)) return redactUrl(value);
  return typeof value === "string" ? scrubText(value) : value;
}

function write(level, message, fields = {}) {
  const entry = { t: new Date().toISOString(), level, msg: message };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) entry[k] = serialize(k, v);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
};
