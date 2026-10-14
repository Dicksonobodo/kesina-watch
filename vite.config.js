import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Serves the Vercel functions in api/ during `npm run dev`, the same way Vercel does in production.
function vercelApiInDev() {
  return {
    name: "vercel-api-in-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url.split("?")[0];
        if (!/^\/api\/[\w/-]+$/.test(path) || path.includes("/_")) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${path.slice(5)}.js`);
          const handler = mod[req.method];
          if (!handler) return next();
          // POST bodies (the games API) have to be read from the Node request first.
          let body;
          if (req.method !== "GET" && req.method !== "HEAD") {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            body = Buffer.concat(chunks);
          }
          const response = await handler(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          if (err?.code === "ERR_LOAD_URL" || /Failed to load url/.test(err?.message)) return next();
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

// The API functions in api/ read server-side secrets from process.env,
// the way Vercel provides them. Vite only exposes VITE_* to the browser, so load .env into the
// dev server's process for them.
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Local games data survives restarts (a git-ignored file) while no Firestore credentials are set.
  if (command === "serve") process.env.GAMES_DEV_FILE ??= ".dev-data/games.json";
  for (const [key, value] of Object.entries(env)) if (!(key in process.env)) process.env[key] = value;
  return config;
});

const config = {
  plugins: [react(), tailwindcss(), vercelApiInDev()],
  define: {
    // Tags error reports with the deployed commit on Vercel.
    "import.meta.env.VITE_RELEASE": JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || process.env.VITE_RELEASE || "dev"),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Loaded lazily (player / downloads); pre-bundling them stops a dev-server reload on first use.
  optimizeDeps: { include: ["hls.js", "mux.js"] },
  build: {
    // firebase and hls.js are large by nature and load in their own cached files.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        // Libraries in their own files: they change rarely, so browsers keep them cached across deploys.
        advancedChunks: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "motion", test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
};
