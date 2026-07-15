# Web-Based Sales Data Analysis System

A web-based system that helps small and micro businesses in Tanzania record stock, sales, and expenses, and visualise their performance through interactive analytics — replacing manual bookkeeping with simple, accessible digital workflows.

## Architecture

This is a **decoupled web application** with two parts:

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                        │
│  React 18 SPA (frontend/)                                │
│  ─ Vite + Tailwind CSS                                   │
│  ─ React Router for client-side navigation               │
│  ─ Axios + JWT for API calls                             │
│  ─ Chart.js for analytics visualisations                 │
│  ─ i18next (English + Swahili)                           │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS, JSON
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FLASK JSON API (backend/)                   │
│  ─ Python 3.11 + Flask 3                                 │
│  ─ JWT authentication (Flask-JWT-Extended)               │
│  ─ Modular blueprints (auth, stock, sales, expenses,     │
│    analytics, reports, dashboard, payments,              │
│    notifications)                                        │
│  ─ ReportLab for PDF generation                          │
│  ─ openpyxl for Excel export                             │
│  ─ ClickPesa API for mobile money (USSD push)            │
└──────────────────────┬──────────────────────────────────┘
                       │ SQLAlchemy (PyMySQL)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   MySQL DATABASE                         │
│  ─ Users, Products, Sales, SaleItems, Expenses           │
│  ─ Payments, Notifications, PasswordResets               │
└─────────────────────────────────────────────────────────┘
```

## Functional Coverage

The system implements all 25 functional requirements from the FYP report:

| Module | Requirements | Status |
|---|---|---|
| **M1: Authentication & Staff** | FR-01..05 | ✅ |
| **M2: Stock Management** | FR-06..08, FR-10 | ✅ |
| **M3: Sales Recording** | FR-09, FR-11..15 | ✅ |
| **M4: Expense Tracking** | FR-16..18 | ✅ |
| **M5: Analytics & Dashboard** | FR-19..23 | ✅ |
| **M6: Reports** | FR-24..25 | ✅ |

Additional features delivered beyond the base requirements:

- **Mobile money payments** — ClickPesa USSD push integration (Mpesa, Tigopesa, Airtel)
- **Excel export** — downloadable spreadsheet for all report types
- **Multi-language** — English and Swahili (i18next), switchable per user
- **In-app notifications** — low-stock alerts, cashier sale events
- **Dark mode** — persisted per device via localStorage
- **Email-based password reset** — secure token link sent to registered email
- **Staff management** — business owners can add/disable cashiers
- **Role-based access** — cashiers see only their own sales history; owners see all
- **Responsive design** — works on mobile and desktop

## Quick Start (Local Development)

You will run **two processes** during development:

1. **Flask backend** on port `5000` (serves the JSON API)
2. **Vite dev server** on port `5173` (serves the React app)

### Prerequisites

| Software | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| MySQL | via XAMPP or standalone |
| Git | any recent version |

See [SETUP.md](./SETUP.md) for full installation instructions.

### TL;DR

```powershell
# 1. Clone the repo
git clone https://github.com/godwin105/Sales-Data-Analysis-System.git "Sales Data Analysis System"
cd "Sales Data Analysis System"

# 2. Backend (Terminal 1)
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Copy .env.example to .env and fill in your values
python app.py     # http://localhost:5000

# 3. Frontend (Terminal 2)
cd frontend
npm install
npm run dev       # http://localhost:5173
```

## Project Structure

```
Sales Data Analysis System/
├── backend/                      # Flask JSON API
│   ├── app.py                    # entry point + create_app()
│   ├── config.py                 # all configuration via environment variables
│   ├── extensions.py             # SQLAlchemy, Bcrypt, JWT, CORS, Mail
│   ├── models.py                 # SQLAlchemy ORM models
│   ├── blueprints/
│   │   ├── auth.py               # /api/auth/*  (register, login, profile, staff)
│   │   ├── dashboard.py          # /api/dashboard
│   │   ├── stock.py              # /api/stock/*
│   │   ├── sales.py              # /api/sales/*
│   │   ├── expenses.py           # /api/expenses/*
│   │   ├── analytics.py          # /api/insights
│   │   ├── reports.py            # /api/reports/* (preview, PDF, Excel)
│   │   ├── payments.py           # /api/payments/* (ClickPesa USSD push)
│   │   └── notifications.py      # /api/notifications
│   ├── services/
│   │   └── clickpesa.py          # ClickPesa API client
│   ├── utils/
│   │   ├── decorators.py         # @admin_required, @cashier_or_admin_required
│   │   ├── time.py               # East Africa Time helpers
│   │   └── email_utils.py        # SMTP send (with dry-run fallback)
│   ├── migrations/               # incremental SQL schema changes
│   ├── schema.sql                # canonical schema (initial setup)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                     # React 18 SPA
│   ├── src/
│   │   ├── api/                  # axios instance + endpoint modules
│   │   ├── components/           # reusable UI (Sidebar, Modal, Charts…)
│   │   ├── context/              # AuthContext, ThemeContext, ToastContext
│   │   ├── i18n/                 # i18next config + English/Swahili locale files
│   │   ├── pages/                # one file per route
│   │   ├── styles/               # Tailwind CSS + custom component layers
│   │   ├── utils/                # formatTZS, initials, date helpers
│   │   ├── App.jsx               # route definitions
│   │   └── main.jsx              # entry point
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── .env.example
│
├── README.md
├── SETUP.md                      # first-time install guide
├── WORKFLOW.md                   # git workflow cheat sheet
└── .gitignore
```

## Authentication Flow

1. User submits email + password to `POST /api/auth/login`
2. Backend verifies credentials (bcrypt) and issues a JWT access token
3. React stores the token in `localStorage` and attaches it as `Authorization: Bearer <token>`
4. Token expires after 8 hours; on 401, React redirects to `/login`
5. Logout is client-side: React removes the token from `localStorage`

## Role System

| Role | Capabilities |
|---|---|
| **Admin (Business Owner)** | Full access — stock, sales, expenses, analytics, reports, staff management, all sales history |
| **Cashier** | Record sales (cash + mobile money), view own sales history, view dashboard for own activity |

## Design System

Tailwind CSS with a custom theme:

| Token | Light | Dark |
|---|---|---|
| Background | `slate-100` | `slate-900` |
| Card surface | `white` | `slate-800` |
| Primary action | `brand-600` (`#2563EB`) | same |
| Emerald accent | `emerald-600` (`#059669`) | same |
| Success | `#16A34A` | same |
| Warning | `#F59E0B` | same |
| Danger | `#DC2626` | same |
| Font | DM Sans | DM Sans |

Dark mode is toggled via the `dark` class on `<html>` (managed by `ThemeContext`) and persisted to `localStorage`.

## Production Deployment

The system is deployed on **DigitalOcean App Platform** with a managed MySQL database.

Environment variables are configured in the DigitalOcean dashboard — see `.env.example` for the full list of required variables.

## Our Team

| Name | Reg. No. | Programme |
|---|---|---|
| TAIRO, Godwin Innocent | 2022-04-12848 | BSc CEIT |
| THOBIAS, Theresia Joseph | 2022-04-12982 | BSc CEIT |
| WAJANGA, Samwel Wajanga | 2022-04-13233 | BSc CEIT |

**Supervisor**: Dr. Mahadia Tunga

**University**: University of Dar es Salaam (UDSM) — Department of Computer Science and Engineering
