# Confluo — Frontend (Next.js UI)

This folder contains the entire Next.js application **except** the API route
(which is in the sibling `backend/` folder).

```
frontend/
├─ app/
│  ├─ layout.js            fonts (Fraunces / Source Serif 4 / Inter) + providers
│  ├─ providers.js         Theme + React Query + Auth + Toaster
│  ├─ globals.css          Quiet Precision design tokens (light/dark) + editor styles
│  ├─ page.js              Marketing landing page
│  ├─ login/page.js        Login
│  ├─ register/page.js     Register (+ demo redirect)
│  ├─ share/[token]/page.js Share-link acceptance
│  └─ docs/
│     ├─ page.js           Dashboard (documents table)
│     └─ [id]/page.js      Collaborative editor (TipTap)
│  └─ api/                 (add the backend route here to run — see root README)
├─ components/
│  ├─ ui/                  shadcn/ui components
│  ├─ site/                Logo, ThemeToggle
│  └─ marketing/           LiveDemo hero island
├─ lib/
│  ├─ auth.js              AuthProvider + apiFetch (bearer token) + collab palette
│  └─ analytics.js         track(event, props) abstraction
└─ config: tailwind.config.js, postcss.config.js, next.config.js, package.json
```

## Run
```bash
yarn install
yarn dev   # http://localhost:3000
```
All API calls are made to `/api/*` (same origin), handled by the backend route.
