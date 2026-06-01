# Web-Based Sales Data Analysis System
A web-based system that helps small and micro businesses in Tanzania record stock, sales, and expenses, and visualise their performance through interactive analytics — replacing manual book-keeping with simple, accessible digital workflows.

##  Architecture

This is a **decoupled web application** with two parts:

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                        │
│  React 18 SPA (frontend/)                                │
│  ─ Vite + Tailwind CSS                                   │
│  ─ React Router for client-side navigation               │
│  ─ Axios + JWT for API calls                             │
│  ─ Chart.js for analytics visualisations                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS, JSON
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FLASK JSON API (backend/)                   │
│  ─ Python 3.11 + Flask 3                                 │
│  ─ JWT authentication (Flask-JWT-Extended)               │
│  ─ Modular blueprints (auth, stock, sales, expenses,     │
│    analytics, reports, dashboard)                        │
│  ─ ReportLab for PDF report generation                   │
└──────────────────────┬──────────────────────────────────┘
                       │ SQLAlchemy
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   MySQL DATABASE                         │
│  ─ Same schema as previous releases                      │
│  ─ 5 core entities (users, products, sales, sale_items,  │
│    expenses) + password_resets                           │
└─────────────────────────────────────────────────────────┘
```

## ✅ Functional Coverage

The system implements all 25 functional requirements from the FYP report:

| Module | Requirements | Status |
|---|---|---|
| **M1: Authentication** | FR-01..05 | ✅ |
| **M2: Stock Management** | FR-06..08, FR-10 | ✅ |
| **M3: Sales Recording** | FR-09, FR-11..15 | ✅ |
| **M4: Expense Tracking** | FR-16..18 | ✅ |
| **M5: Analytics & Dashboard** | FR-19..23 | ✅ |
| **M6: Reports** | FR-24..25 | ✅ |
| **M6+: Business Insights** | extension | ✅ |

Plus all UAT-driven additions: responsive design, password show/hide, profile editing, admin password reset for cashiers, email-based forgot password, dark mode, and soft-delete for accounts with sales history.

##   Quick Start (Local Development)

You will run **two processes** during development:

1. **Flask backend** on port `5000` (serves the JSON API)
2. **Vite dev server** on port `5173` (serves the React app)

### Prerequisites

| Software Version 
|------
| Python 3.11+ 
| Node.js 18+ 
| MySQL via XAMPP or standalone
| Git any recent version 

See [SETUP.md](./SETUP.md) for full installation instructions including XAMPP setup.

### TL;DR

```powershell
# 1. Clone the repo
git clone <repo-url> "Sales Data Analysis System"
cd "Sales Data Analysis System"

# 2. Backend setup (terminal 1)
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Create .env # then edit .env with your MySQL credentials
python app.py     # http://localhost:5000

# 3. Frontend setup (terminal 2)
cd frontend
npm install
Create .env   # default points to localhost:5000
npm run dev                   # http://localhost:5173
```

Open <http://localhost:5173> in your browser. Register a new account, log in, and start using the system.

##  Project Structure

```
Sales Data Analysis System/
├── backend/                      # Flask JSON API
│   ├── app.py                    # entry point + create_app()
│   ├── config.py                 # all configuration via env vars
│   ├── extensions.py             # SQLAlchemy, Bcrypt, JWT, CORS
│   ├── models.py                 # SQLAlchemy models for all entities
│   ├── blueprints/
│   │   ├── auth.py               # /api/auth/*  (register, login, JWT, profile, staff, reset)
│   │   ├── dashboard.py          # /api/dashboard
│   │   ├── stock.py              # /api/stock/*
│   │   ├── sales.py              # /api/sales/*
│   │   ├── expenses.py           # /api/expenses/*
│   │   ├── analytics.py          # /api/insights
│   │   └── reports.py            # /api/reports/* (preview + PDF download)
│   ├── utils/
│   │   ├── decorators.py         # @admin_required, @cashier_or_admin_required
│   │   └── email_utils.py        # SMTP send (with dry-run mode)
│   ├── migrations/               # SQL files for incremental schema changes
│   ├── schema.sql                # canonical schema (initial setup)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                     # React 18 SPA
│   ├── src/
│   │   ├── api/                  # axios + endpoint modules
│   │   ├── components/           # reusable UI (Sidebar, Modal, etc.)
│   │   ├── context/              # AuthContext, ThemeContext, ToastContext
│   │   ├── pages/                # one file per route (Dashboard, Stock, ...)
│   │   ├── styles/               # Tailwind CSS + custom layers
│   │   ├── utils/                # formatTZS, initials, dates...
│   │   ├── App.jsx               # all routes
│   │   └── main.jsx              # entry point
│   ├── public/                   # static files (favicon)
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── .env.example
│
├── docs/
│   └── architecture-migration.md # rationale for FYP report
│
├── README.md                     # this file
├── SETUP.md                      # first-time install for teammates
├── WORKFLOW.md                   # daily git workflow cheat sheet
├── CONTRIBUTING.md
└── .gitignore
```

##  Authentication Flow

1. User submits email + password to `POST /api/auth/login`
2. Backend verifies credentials (bcrypt) and issues a JWT access token
3. React stores the token in `localStorage` and attaches it to subsequent requests as `Authorization: Bearer <token>`
4. The token expires after 8 hours; on 401, React redirects to `/login`
5. Logout is client-side: React simply removes the token from `localStorage`

##  Design System

Tailwind CSS with a custom theme matching the original branding:

| Token | Light | Dark |
|---|---|---|
| Background | `slate-100` | `slate-900` |
| Card surface | `white` | `slate-800` |
| Primary action | `brand-600` (`#2563EB`) | same |
| Success | `success` (`#16A34A`) | same |
| Warning | `warning` (`#F59E0B`) | same |
| Danger | `danger` (`#DC2626`) | same |
| Font | DM Sans | DM Sans |

Dark mode is toggled via the `dark` class on `<html>` (managed by `ThemeContext`) and persisted to `localStorage`.

## Our Team

| Name | Reg. No. | Programme |
|---|---|---|
| TAIRO, Godwin Innocent | 2022-04-12848 | BSc CEIT |
| THOBIAS, Theresia Joseph | 2022-04-12982 | BSc CEIT |
| WAJANGA, Samwel Wajanga | 2022-04-13233 | BSc CEIT |

**Supervisor**: Dr. Mahadia Tunga
