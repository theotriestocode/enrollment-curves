# Enrollment Touchpoint Lifecycle Curves

Live dashboard showing how scheduled and completed onboarding calls ramp after each marketing touchpoint, broken out by URL or channel (DM / Email / Airbo).

Data source: PostHog (EU Cloud), proxied via Cloudflare Worker.

---

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your repo
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click Deploy

Vercel auto-deploys on every push to `main`.

---

## Cloudflare Worker

The PostHog API key lives in the Cloudflare Worker (not in this repo).
Worker URL: `https://muddy-shape-ae45.theo-f92.workers.dev/`

To update the API key:
1. Go to dash.cloudflare.com → Workers → muddy-shape-ae45
2. Edit line 34: `"Authorization": "Bearer <new_key>"`
3. Click Deploy

---

## Adding a new partner

Open `src/App.tsx` and make these 3 changes:

### 1. Add to PARTNER_KEYS array (around line 30)
```ts
const PARTNER_KEYS = ["sisc", "rrd", "momentum", "hp", "hearst"];
//                                                        ^^^^^^^ add here
```

### 2. Add to PARTNER_CONFIG (around line 36)
```ts
hearst: {
  label: "Hearst",
  urlPattern: "/partner/hearst",   // must match the URL path PostHog sees
  utmSources: ["hearst"],          // utm_source values used in campaign URLs
},
```

### 3. Add placeholder data to PARTNER_DATA (around line 300)
```ts
hearst: {
  lp_url:    [],  // will be populated by live PostHog data
  sched_url: [],
  comp_url:  [],
},
```

### 4. Update the Cloudflare Worker regex (one place)
In worker.js, the three queries filter by partner URL pattern:
```
match(properties.$current_url, '/partner/(sisc|rrd|momentum|hp)')
```
Add the new partner:
```
match(properties.$current_url, '/partner/(sisc|rrd|momentum|hp|hearst)')
```
Deploy the worker.

That's it — the new partner will appear as a button in the UI on next page load.

---

## Channel classification

Channels are inferred from `utm_medium` in `src/App.tsx` → `classifyChannel()`:

| utm_medium contains | Channel |
|---------------------|---------|
| `airbo` | Airbo |
| `webinar` | Webinar |
| `dm`, `direct_mail`, `postcard` | Direct Mail |
| `email`, `oe` | Email |
| (none) | Unattributed |

To add or adjust channel rules, edit the `classifyChannel` function.

---

## Year filter logic

The year selector filters by **launch date year** (first LP visit for that URL/channel), not the call event date. This means:
- Selecting 2025 shows all calls attributed to campaigns that launched in 2025
- A 2025 Airbo campaign whose calls trickle into 2026 will appear under 2025
