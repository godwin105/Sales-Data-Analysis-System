# Setup Guide — First-Time Installation

Follow this guide if you're setting up the project on your machine for the first time. **Time required: 30–45 minutes.**

> 💡 If you already had the previous Flask-only version running, you still need to install Node.js and the frontend dependencies — see [§ Migrating from the old version](#-migrating-from-the-old-version) at the bottom.

---

## 1. Prerequisites

You need all four installed and on your `PATH`:

| Software | How to install on Windows | Verify |
|---|---|---|
| **Python 3.11+** | <https://www.python.org/downloads/> — tick "Add Python to PATH" during install. | `python --version` |
| **Node.js 18+** (includes npm) | <https://nodejs.org/> — pick the LTS installer. | `node --version` and `npm --version` |
| **MySQL** | Easiest: install **XAMPP** from <https://www.apachefriends.org/> — gives you MySQL + phpMyAdmin in one click. | Open XAMPP Control Panel → Start MySQL |
| **Git** | <https://git-scm.com/download/win> | `git --version` |

Open **PowerShell** and check each one:

```powershell
python --version    # should print Python 3.11.x or higher
node --version      # should print v18.x.x or higher
npm --version       # should print 9.x.x or higher
git --version       # any recent version is fine
```

If any command says "not recognized", install that piece first.

---

## 2. Clone the repository

```powershell
cd "D:\4th Year\FYP"   # or wherever you keep the project
git clone https://github.com/godwin105/Sales-Data-Analysis-System.git "Sales Data Analysis System"
cd "Sales Data Analysis System"
```

You should now see two folders side by side: `backend/` and `frontend/`.

---

## 3. Set up the database

1. **Start MySQL** via XAMPP Control Panel.
2. Open **phpMyAdmin** at <http://localhost/phpmyadmin>.
3. Create a new database called `sales_data_analysis_system` (collation: `utf8mb4_unicode_ci`).
4. Select the new database → **Import** → choose `backend/schema.sql` → Go.
5. Run each migration in order:
   - Import `backend/migrations/release2_add_soft_delete.sql`
   - Import `backend/migrations/uat_add_password_resets.sql`
   - Import `backend/migrations/uat_add_is_active.sql`

After import you should see five tables: `users`, `products`, `sales`, `sale_items`, `expenses`, plus `password_resets`.

---

## 4. Set up the backend (Terminal #1)

```powershell
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# If PowerShell blocks the activation script, run this once:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Install dependencies
pip install -r requirements.txt

# Create .env from the template
Copy-Item .env.example .env
notepad .env
```

In `.env`, fill in the following at minimum:

```ini
SECRET_KEY=replace-with-a-long-random-string
JWT_SECRET_KEY=replace-with-a-different-long-random-string

MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=             # XAMPP default is empty
MYSQL_DB=sales_data_analysis_system

CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# (Optional, for password-reset emails. Leave commented for dry-run mode.)
# MAIL_USERNAME=youraddress@gmail.com
# MAIL_PASSWORD=your-app-password
# MAIL_DEFAULT_SENDER=youraddress@gmail.com
```

> 🔐 **Generate strong secrets** with: `python -c "import secrets; print(secrets.token_hex(32))"`

Now start the Flask server:

```powershell
python app.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

Open <http://localhost:5000/api/health> in your browser — you should get `{"status": "ok"}`. Leave this terminal running.

---

## 5. Set up the frontend (Terminal #2)

Open a **new** PowerShell window (keep the backend running in the first one):

```powershell
cd "D:\4th Year\FYP\Sales Data Analysis System\frontend"

# Install Node dependencies (takes 1–3 minutes the first time)
npm install

# Create .env from the template
Copy-Item .env.example .env
# The default value (VITE_API_URL=http://localhost:5000) works as-is.

# Start the dev server
npm run dev
```

You should see:
```
  VITE v5.x  ready in 800 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open <http://localhost:5173> — you'll land on the login page. Click **Create an account**, register your business, and start using the system.

---

## 6. Daily routine

After the initial setup, you only need to do this each time you work on the project:

1. **Start XAMPP MySQL.**
2. **Terminal #1 (backend):**
   ```powershell
   cd "D:\4th Year\FYP\Sales Data Analysis System\backend"
   .\venv\Scripts\Activate.ps1
   python app.py
   ```
3. **Terminal #2 (frontend):**
   ```powershell
   cd "D:\4th Year\FYP\Sales Data Analysis System\frontend"
   npm run dev
   ```
4. Open <http://localhost:5173>.

To stop: press `Ctrl+C` in each terminal.

---

## 🐛 Troubleshooting

### "ModuleNotFoundError" when running `python app.py`
You haven't activated the venv. Run `.\venv\Scripts\Activate.ps1` first — your prompt should change to `(venv)`.

### "ImportError: No module named 'flask_jwt_extended'"
Run `pip install -r requirements.txt` again from inside the activated venv.

### "Access denied for user 'root'@'localhost'"
Wrong MySQL password in `.env`. XAMPP's default is empty (`MYSQL_PASSWORD=`).

### "Can't connect to MySQL server"
You forgot to start MySQL. Open XAMPP Control Panel and click "Start" next to MySQL.

### "CORS error" in browser console
Check that `CORS_ORIGINS=http://localhost:5173` is in `backend/.env` and you restarted the Flask server.

### "Network Error" when logging in (frontend)
Backend isn't running. Check Terminal #1.

### `npm install` fails with permission errors
Run PowerShell as Administrator, or delete `node_modules/` and `package-lock.json`, then retry.

### Login redirects me back to login immediately
JWT secret changed since you last logged in. Clear browser localStorage:
- Open DevTools (F12) → Application → Local Storage → Clear All

---

## 🔄 Migrating from the old version

If you previously had the **Jinja2-only** Flask version running locally:

1. **Pull the latest code** with `git pull`.
2. The old `app.py`, `templates/`, and `static/` are still on `main` — they're just no longer the active UI. You can safely ignore them.
3. The new code lives in `backend/` and `frontend/`. Follow steps 4 and 5 above as if it were a fresh install.
4. Your existing MySQL database **does not need to be recreated** — same schema. Just make sure all three migration files have been imported.
5. Your existing user accounts will continue to work — bcrypt password hashes are compatible.

---

## 📞 Need help?

Ping the team WhatsApp group, or open an issue on GitHub.
