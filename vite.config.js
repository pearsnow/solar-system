import { defineConfig } from 'vite';

// Same rules for both serving modes: bind everywhere (cloudflared dials
// 127.0.0.1 while Windows may resolve localhost to ::1), never silently move to
// another port, and accept the random *.trycloudflare.com hostname.
const shared = {
  host: true,
  strictPort: true,
  allowedHosts: ['.trycloudflare.com'],
};

export default defineConfig({
  // Local dev and preview serve from the root. GitHub Pages serves this project
  // from /solar-system/, so the workflow sets PAGES=1 and the asset URLs get the
  // prefix. Hard-coding the prefix would break `npm run dev` for everyone.
  base: process.env.PAGES ? '/solar-system/' : '/',

  server: {
    ...shared,

    port: 5173,

    // If 5173 is taken, fail loudly instead of silently moving to 5174 and
    // leaving the tunnel pointed at a dead port.
  },

  // Production preview has its own section; `server` options do not apply to it.
  preview: {
    ...shared,
    port: 4173,
  },
});
