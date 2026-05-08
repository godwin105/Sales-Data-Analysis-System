# Architecture Migration: From Server-Rendered Templates to a Decoupled SPA

> This document records the rationale for the mid-project architectural change from a **Flask + Jinja2** server-rendered web application to a **decoupled React SPA + Flask JSON API**. It is written for inclusion in Chapter 4 of the FYP report and as a reference for project examiners.

## 1. Background

The original system, as described in the End-of-Semester-One report (Chapter 4: System Analysis and Design), was specified as a three-tier web architecture:

| Layer | Original Technology |
|---|---|
| Presentation | HTML5, CSS3, Bootstrap 5, Chart.js |
| Application Logic | Python (Flask) with **Jinja2 server-side templating** |
| Data | MySQL |

This design was implemented and delivered in full across the six XP releases of Semester One. All twenty-five functional requirements (FR-01 through FR-25) and all eight non-functional requirements (NFR-01 through NFR-08) were satisfied by the Jinja2 implementation.

## 2. Drivers for the Change

During User Acceptance Testing with vendors at Mwenge and Makumbusho markets, three observations emerged that motivated re-evaluating the presentation layer:

1. **Mobile responsiveness was constrained.** Vendors who tested the system overwhelmingly accessed it from mobile phones. Although Bootstrap 5 provides a responsive grid, the full-page Jinja2 reload model meant every interaction (recording a sale, applying a filter, deleting an expense) required a round-trip to the server and a complete re-paint, which felt sluggish on weaker mobile connections common in the target market.

2. **Interactivity expectations.** Several UAT participants asked for inline behaviours that are awkward in pure server-rendered apps — for example, computing a sale's running subtotal as quantities are typed, or showing an instant warning when a quantity exceeds available stock without waiting for form submission. These can be added piecemeal with vanilla JavaScript on Jinja2 pages, but doing so consistently across the system pushes the architecture beyond what server-side templating is well suited to.

3. **Examiner-facing demo polish.** A single-page application with smooth client-side transitions and persistent state (theme, login session, toast notifications) presents a more professional impression in a defence demonstration than a multi-page reload-driven app, even when the underlying functionality is identical.

After consultation with the project supervisor (Dr. Mahadia Tunga) and explicit written approval, the team chose to migrate the presentation layer to a React Single-Page Application while preserving the rest of the architecture intact.

## 3. What Changed and What Did Not

| Concern | Before | After |
|---|---|---|
| Presentation framework | Jinja2 templates rendered server-side | React 18 SPA built with Vite |
| Styling | Bootstrap 5 | Tailwind CSS (custom theme matching original brand) |
| Charts | Chart.js loaded inline | `react-chartjs-2` wrapper around the same Chart.js |
| Page navigation | Flask routes returning HTML, full reload | React Router, no full reload after login |
| Authentication mechanism | Flask-Login session cookies | JSON Web Tokens (Flask-JWT-Extended), stored in `localStorage` |
| Form handling | Flask-WTF forms with CSRF tokens | Native HTML inputs + `fetch`/Axios JSON requests |
| Flash messages | `flash()` + Bootstrap alerts in template | React toast notifications |
| API surface | HTML responses | JSON responses (`/api/*` namespace) |
| **Backend logic** | **Flask + SQLAlchemy + bcrypt** | **Unchanged — same blueprints, same models, same business rules** |
| **Database schema** | 5 tables + password_resets | **Unchanged — same DDL, same constraints, same migrations** |
| **Functional requirements** | All 25 FRs implemented | **All 25 FRs preserved** |

The crucial point is that **all five core modules (M1–M5), the M6 reporting module, and the post-UAT M6+ Insights extension are functionally identical**. The migration is a presentation-layer refactor; no requirement was added, removed, or altered as a result.

## 4. New System Architecture

The system is now a **decoupled web application** consisting of two independently deployable parts that communicate over HTTP+JSON:

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                        │
│  React 18 Single-Page Application                        │
│  ─ Vite + Tailwind CSS + React Router                    │
│  ─ Axios HTTP client with JWT authorization              │
│  ─ Chart.js (via react-chartjs-2) for analytics          │
│  ─ Client-side state: AuthContext, ThemeContext,         │
│    ToastContext                                          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       │ JSON requests/responses
                       │ Authorization: Bearer <JWT>
                       ▼
┌─────────────────────────────────────────────────────────┐
│              FLASK JSON API                              │
│  ─ Python 3.11 + Flask 3                                 │
│  ─ Flask-JWT-Extended for stateless authentication       │
│  ─ Flask-CORS for cross-origin requests in development   │
│  ─ Modular blueprints (auth, dashboard, stock, sales,    │
│    expenses, analytics, reports)                         │
│  ─ ReportLab for PDF report generation                   │
└──────────────────────┬──────────────────────────────────┘
                       │ SQLAlchemy ORM
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   MySQL DATABASE                         │
│  ─ users · products · sales · sale_items · expenses      │
│  ─ password_resets (UAT addition)                        │
│  ─ Same schema, constraints, and ERD as Chapter 4        │
└─────────────────────────────────────────────────────────┘
```

The three-tier separation prescribed in the original design (Presentation / Application Logic / Data) is preserved — only the technology in the Presentation Layer has changed from server-side templating to a client-side SPA.

## 5. Authentication: Sessions vs JWT

The original design used Flask-Login session cookies. With a decoupled SPA, sessions become awkward because the frontend and backend may run on different origins (in development they do: `:5173` vs `:5000`). The team adopted **JSON Web Tokens** as a stateless alternative:

1. User submits credentials to `POST /api/auth/login`.
2. Backend verifies the bcrypt password hash and issues a signed JWT containing the user ID.
3. The React app stores the token in `localStorage` and attaches it to subsequent requests as an `Authorization: Bearer …` header.
4. The token expires after eight hours; on a `401` response the React client redirects to `/login`.
5. Logout is purely client-side: the token is removed from `localStorage` (Flask does not maintain server-side session state).

The five-strike account-lockout requirement (FR-05) and the `is_active`/soft-delete logic (UAT) are unchanged — they are enforced inside the login route itself, which now returns JSON instead of redirecting.

## 6. Why This Was Reasonable Within the FYP Scope

The migration was undertaken with the following safeguards in place:

- **Supervisor approval was obtained in writing** before any code was changed.
- **The backend, models, and database schema are byte-for-byte identical** to the Semester One submission, save for adapting routes to return JSON. This means the original FYP report's Chapter 4 (entity-relationship diagram, data flow diagrams, sequence diagrams, etc.) remains accurate as documentation of the *system*, not just an earlier version of it.
- **No functional requirement was lost.** A direct mapping between FRs and React pages is given in the project README.
- **The original Jinja2 templates remain in the repository's git history** as a fallback, so the team could revert to them in the unlikely event of catastrophic problems before the defence.
- **Knowledge transfer**: only one team member (Tairo) had prior React experience. Two pair-programming sessions and a written walk-through of the new code structure (in `WORKFLOW.md` and the inline comments throughout `frontend/src/`) brought the other two members to sufficient familiarity to discuss their respective modules during the defence.

## 7. Trade-offs and Honest Limitations

We are aware that the migration introduces costs:

- **More moving parts.** Two processes (Flask + Vite) must be running during development. This is documented in `SETUP.md`.
- **Build pipeline complexity.** Production deployment requires building the React app to static files and serving them alongside the Flask API. We have not yet performed a production deployment; the system is demonstrated locally for the defence.
- **Larger initial download.** The SPA bundle is downloaded once on first load, which is heavier than the first Jinja2 page. Subsequent navigations are faster, however, because only JSON travels over the wire.
- **JavaScript dependency.** A user with JavaScript disabled cannot use the system at all. We judged this acceptable because the target users (vendors with phones) all run JavaScript-capable browsers.

These trade-offs were judged acceptable given the user-facing improvements in interactivity and mobile experience, and given that a production deployment is not within the FYP scope (the system is delivered as a working local demonstration of all 25 functional requirements).

## 8. Mapping This Document to the FYP Report

For the final report, this rationale should be summarised in **Chapter 4 (System Analysis and Design)** under a new subsection titled *"Presentation Layer Refactor"* placed immediately after the System Architecture section. The diagrams in this document can be used directly. The functional requirements table, ERD, sequence diagrams, and DFDs from the original Chapter 4 do not need to change — they describe the system at a level above the presentation framework.
