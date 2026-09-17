# Confluo — Backend (Next.js API route)

This is the server side of Confluo: a single Next.js **catch-all API route** that
handles every `/api/*` request and talks to MongoDB.

```
backend/
└─ api/
   └─ [[...path]]/route.js   All backend endpoints + MongoDB access
```

To run, this route must live inside the Next.js app directory at
`frontend/app/api/[[...path]]/route.js` (see the root README).

## Endpoints (all prefixed with /api)

### Auth
- `POST /api/auth/register` — { email, password, displayName } -> { user, token }
- `POST /api/auth/login` — { email, password } -> { user, token }
- `GET  /api/me` — (Bearer) -> { user }

### Documents
- `GET    /api/docs` — list docs the user owns or collaborates on
- `POST   /api/docs` — create { title }
- `GET    /api/docs/:id` — full doc (role-gated)
- `PUT    /api/docs/:id` — update { content } (editor+) and/or { title } (If-Match versioning -> 412)
- `DELETE /api/docs/:id` — owner only

### Comments
- `GET    /api/docs/:id/comments`
- `POST   /api/docs/:id/comments` — { body, anchorText?, blockId?, parentId? } (commenter+)
- `POST   /api/comments/:id/resolve` — { resolved }
- `DELETE /api/comments/:id` — author or owner

### Sharing
- `POST   /api/docs/:id/share` — { email, role } (owner)
- `PUT    /api/docs/:id/collaborators/:userId` — { role } (owner)
- `DELETE /api/docs/:id/collaborators/:userId` — (owner)
- `POST   /api/docs/:id/share-link` — { role, expiryDays } (owner)
- `GET    /api/share/:token` — link preview
- `POST   /api/share/:token/accept` — join doc via link

## Data model (MongoDB collections)
- `users` — { id, email, displayName, passwordHash (scrypt), color, createdAt }
- `sessions` — { token, userId, createdAt }
- `docs` — { id, title, content (TipTap JSON), ownerId, collaborators[], shareLinks[], version, timestamps }
- `comments` — { id, docId, authorId, authorName, authorColor, body, anchorText, blockId, parentId, resolved, createdAt }

Permission matrix (ROLE_RANK): viewer < commenter < editor < owner, enforced server-side.
All IDs are UUIDs (no Mongo ObjectIDs exposed).

## Env
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=confluo
CORS_ORIGINS=*
```
