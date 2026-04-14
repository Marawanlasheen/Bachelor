# Deploy Guide (Render + Docker + Postgres)

## 1) Push this project to GitHub
Render deploys from a git repo.

## 2) Create Postgres on Render
1. In Render dashboard, create `New +` -> `PostgreSQL`.
2. After it is ready, copy the `Internal Database URL`.

## 3) Create backend Web Service (Docker)
1. Create `New +` -> `Web Service`.
2. Connect your GitHub repo.
3. Render detects the `Dockerfile`.
4. Set environment variables in the backend service:
   - `DATABASE_URL` = your Render Postgres internal URL
   - `GROQ_API_KEY` = your Groq key
   - `GROQ_MODEL` = `llama-3.1-8b-instant`
   - `AUTH_SECRET_KEY` = long random string
   - `CORS_ALLOWED_ORIGINS` = frontend URL (comma-separated if multiple)
5. Deploy.

## 4) Deploy frontend (Static Site)
1. Create `New +` -> `Static Site` and point to the same repo.
2. Root directory: `frontend`
3. Build command: `npm install ; npm run build`
4. Publish directory: `dist`
5. Add env var:
   - `VITE_API_BASE_URL` = your backend URL (e.g. `https://your-backend.onrender.com`)
6. Deploy.

## 5) Update backend CORS
After frontend deploys, copy frontend URL and set backend env:
- `CORS_ALLOWED_ORIGINS=https://your-frontend.onrender.com`

Redeploy backend.

## 6) Test
1. Open frontend URL.
2. Sign up a new student account.
3. Open Assignments and submit code.
4. Verify progress is saved after refresh and after re-login.
