/*
 * One JSON line per event: readable in a terminal, searchable in Render / Railway / any log viewer.
 */

function serialize(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, status: value.status, stack: value.stack?.split("\n").slice(0, 6).join("\n") };
  }
  return value;
}

function write(level, message, fields = {}) {
  const entry = { t: new Date().toISOString(), level, msg: message };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) entry[k] = serialize(v);
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
