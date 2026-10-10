import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
