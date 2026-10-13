import { Navigate, useSearchParams } from "react-router-dom";

/**
 * Android "Share → Dixon Watch" lands here (see share_target in manifest.webmanifest).
 * Apps share the link as `url`, or inside `text` (often "Title https://…"), so both are checked.
 */
export function SharePage() {
  const [params] = useSearchParams();
  const raw = params.get("url") || params.get("text") || "";
  const link = raw.match(/https?:\/\/\S+/)?.[0];
  if (!link) return <Navigate to="/live" replace />;
  return <Navigate to={`/live?u=${encodeURIComponent(link)}`} replace />;
}
