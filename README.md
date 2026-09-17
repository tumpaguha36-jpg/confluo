# Confluo — Full Project Export

Confluo is a Google-Docs-style collaborative rich-text editor built with the
**Next.js (App Router) + MongoDB** full-stack template. In the running app the
frontend and backend live in a single Next.js project; this export splits them
into two folders for clarity.

```
confluo/
├─ frontend/   Next.js UI: pages, components, lib, styles, config
└─ backend/    The Next.js API route (server / MongoDB logic)
```

## Important: this is one Next.js app
Next.js serves both the UI and the API from the same process. The `backend/`
folder contains the catch-all API route that normally lives at
`frontend/app/api/[[...path]]/route.js`. To run the project, the backend route
must sit inside the Next.js `app/` directory.

### To run locally
1. Put the backend route back into the app dir:
   ```bash
   mkdir -p frontend/app/api
   cp -r backend/api/"[[...path]]" frontend/app/api/
   ```
2. Install & run:
   ```bash
   cd frontend
   yarn install
   yarn dev        # http://localhost:3000
   ```
3. Requires a MongoDB instance. Configure `.env`:
   ```
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=confluo
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   CORS_ORIGINS=*
   ```

## Feature overview
- Marketing landing page ("Quiet Precision" design system)
- Email + password auth (bearer token sessions)
- Dashboard: list / create / rename / delete documents with roles
- TipTap rich-text editor: toolbar, presence, connection badge, soft-lock chips,
  comments sidebar, share dialog, image upload, read-only mode, autosave
- Server-enforced permission matrix: viewer / commenter / editor / owner

> Note: real-time multi-user CRDT sync is simulated in this build; document
> persistence (autosave to MongoDB) is real.

See `frontend/README-frontend.md` and `backend/README-backend.md` for details.
