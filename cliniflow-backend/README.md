# Cliniflow backend entry

**Production entry (Render):** repo root `node index.cjs` — see root `package.json`. **`cliniflow-backend/index.cjs`** is a one-file shim that forwards to **`run.cjs`**, which loads **`../index.cjs`** (full API). Prefer **`cd .. && node index.cjs`** from repo root. No `.env` file is required on Render when env vars are set in the dashboard.

The small **`server/index.js`** is optional for local experiments only; it is **not** used when you `npm start` from this folder.

## Setup

1. Copy `.env.example` → `.env` in **this folder** (`cliniflow-backend/.env`).
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ROBOFLOW_API_KEY` (real values).
3. Run:

```bash
cd cliniflow-backend && npm start
```

Or from repo root:

```bash
node cliniflow-backend/run.cjs
```

## Env loading order

1. **`run.cjs`**: in production, dotenv is skipped; use Render (or host) environment variables.
2. Non-production: optional `dotenv` (repo or cwd `.env`).
3. Root **`index.cjs`**: same rule — dotenv only when `NODE_ENV !== "production"`.

## Main routes (non-exhaustive)

- `POST /api/patient/login`, `POST /api/doctor/login`, admin routes, chat, uploads, …
- `POST /analyze-teeth`, `POST /api/analyze-teeth` (Roboflow — mounted from `server/routes/analyze-teeth.js` into root `index.cjs`)

## Generic `/api/login`

`POST /api/login` returns **400** with hints pointing to the role-specific login URLs above (there is no single shared credential table).
