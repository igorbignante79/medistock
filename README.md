# Medistock (Frontend + Backend)

Repo pronto da pushare su GitHub e deployare su Render in **2 servizi**:
- **backend**: Web Service (Express + Socket.IO + JWT + Postgres opzionale)
- **frontend**: Static Site (Vite + React)

## Avvio locale (facoltativo)
Apri due terminali.

### Backend
```bash
cd backend
npm install
npm run dev
```
Backend: http://localhost:10000/health

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend: http://localhost:5173

## Variabili ambiente

### Backend (Render o locale)
Copia `backend/.env.example` in `backend/.env` (in locale).
Su Render aggiungi le stesse variabili in Environment.

- JWT_SECRET: stringa lunga
- ADMIN_USERNAME / ADMIN_PASSWORD: credenziali admin iniziali
- DATABASE_URL: opzionale (se manca usa RAM)
- CORS_ORIGIN: `*` per partire facile, poi metti l'URL del frontend

### Frontend (Render)
Imposta `VITE_API_BASE` con l'URL del backend, es:
`https://TUO-BACKEND.onrender.com`

## Deploy su Render (riassunto)

### 1) Backend — Web Service
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Env: JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, CORS_ORIGIN, DATABASE_URL (opzionale)

### 2) Frontend — Static Site
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Env: VITE_API_BASE = URL backend
