# RefrigHandle

A mobile/tablet-friendly **refrigerant inventory tracker** for HVAC/R technicians.
Built as an installable Progressive Web App (PWA) so it runs on iPad, iPhone,
Android phones/tablets, and any desktop browser from a single codebase.

## What it tracks

- **Bottles** — ID/serial, refrigerant type (R410A, R22, R32, R134A, R407C, R404A,
  R290, R600A, R1234YF, R454B, R513A), tare weight,
  current gross weight, status (in stock / on site / returned / empty)
- **Sites / locations** — clients, addresses, which bottles are deployed there
- **Transactions** — charge into equipment, recover from equipment, transfer
  bottle to site, return to stock, manual adjustments. Every transaction
  records before/after weights, technician, date, and notes
- **Totals** — total kg in stock and per-refrigerant-type breakdown on the
  dashboard
- **Backup** — export everything to JSON, transaction log to CSV, or import
  a JSON backup

All data is stored **locally on the device** (`localStorage`), so the app
works fully offline. No server, no account.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the URL on your phone/tablet (same Wi-Fi) and use the browser's
"Add to Home Screen" option. From then on it launches like a native app.

## Build & deploy

```bash
npm run build        # outputs ./dist
```

Drop `dist/` on any static host (Netlify, Vercel, Cloudflare Pages, GitHub
Pages, S3, even a USB stick served via `npx serve dist`).

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS for the mobile-first UI
- React Router for navigation
- `vite-plugin-pwa` (Workbox) for offline + installability
- localStorage persistence (swap to IndexedDB / a sync server later without
  changing the UI)

## Roadmap (later)

- Multi-device sync (Supabase scaffolding is already in — see SYNC.md)
- Wrap as a native iOS/Android app via Capacitor for stricter store presence
- Wrap as a desktop app via Tauri
