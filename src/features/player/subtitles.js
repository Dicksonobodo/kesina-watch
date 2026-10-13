import { canRelay, relayUrl } from "@/lib/relay";

/*
 * Subtitle files found on the page (.vtt / .srt). Browsers only show WebVTT and need it
 * same-origin or CORS-enabled, so the file is fetched (directly, else via the relay),
 * converted from SRT if needed, and attached as a local blob: URL.
 */

export function srtToVtt(srt) {
  const body = srt
    .replace(/\r+/g, "")
    .replace(/^﻿/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") // 00:00:01,500 → 00:00:01.500
    .replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2}\.\d{3}\s*-->)/gm, ""); // drop cue numbers
  return `WEBVTT\n\n${body.trim()}\n`;
}

export async function loadSubtitle(sub) {
  const tryFetch = async (url) => {
    const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };
  let text;
  try {
    text = await tryFetch(sub.url);
  } catch {
    if (!canRelay(sub)) throw new Error("Subtitles unavailable");
    text = await tryFetch(relayUrl(sub, sub.url));
  }
  const vtt = text.trimStart().startsWith("WEBVTT") ? text : srtToVtt(text);
  return URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
}

/** Plain-text download of a subtitle file (keeps the original format). */
export async function downloadSubtitle(sub, baseName) {
  let text;
  try {
    const res = await fetch(sub.url, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error();
    text = await res.text();
  } catch {
    const res = await fetch(relayUrl(sub, sub.url));
    text = await res.text();
  }
  const ext = /\.srt(\?|$)/i.test(sub.url) ? "srt" : "vtt";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = `${baseName}${sub.lang ? `.${sub.lang}` : ""}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
