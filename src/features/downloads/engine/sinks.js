/**
 * Where downloaded bytes go.
 * - Disk (Chrome / Edge on desktop): written straight to a file the user picks, so a
 *   4 GB movie never sits in memory.
 * - Memory (other browsers): collected and saved when complete. Fine for most files,
 *   but very large ones can run out of memory on phones.
 */

export const canWriteToDisk = typeof window !== "undefined" && "showSaveFilePicker" in window;

// Must be called straight from a click: browsers only show the save dialog for user actions.
export async function openDiskSink(filename) {
  const handle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [{ description: "Video", accept: { "video/mp4": [".mp4"], "video/mp2t": [".ts"] } }],
  });
  const writable = await handle.createWritable();
  return {
    kind: "disk",
    name: handle.name,
    write: (chunk) => writable.write(chunk),
    close: () => writable.close(),
    abort: () => writable.abort().catch(() => {}),
    setExtension() {
      /* the user already chose the file name */
    },
  };
}

export function openMemorySink(filename) {
  let parts = [];
  let name = filename;
  return {
    kind: "memory",
    get name() {
      return name;
    },
    write(chunk) {
      parts.push(chunk);
    },
    setExtension(ext) {
      name = name.replace(/\.\w+$/, `.${ext}`);
    },
    close() {
      const blob = new Blob(parts, { type: name.endsWith(".ts") ? "video/mp2t" : "video/mp4" });
      parts = [];
      saveBlob(blob, name);
    },
    abort() {
      parts = [];
    },
  };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function saveUrl(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
