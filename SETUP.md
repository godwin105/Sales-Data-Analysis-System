# Setup Guide — First-Time Installation

Follow this guide if you are setting up the project on your machine for the first time.

---

## 1. Prerequisites

You need all four installed and on your `PATH`:

| Software | How to install | Verify |
|---|---|---|
| **Python 3.11+** | <https://www.python.org/downloads/> — tick "Add Python to PATH" during install | `python --version` |
| **Node.js 18+** | <https://nodejs.org/> — pick the LTS installer | `node --version` |
| **MySQL** | Easiest: install **XAMPP** from <https://www.apachefriends.org/> — gives you MySQL + phpMyAdmin in one click | Open XAMPP Control Panel → Start MySQL |
| **Git** | <https://git-scm.com/download/win> | `git --version` |

Open **PowerShell** and verify each one:

```powershell
python --version    # Python 3.11.x or higher
node --version      # v18.x.x or higher
npm --version       # 9.x.x or higher
git --version       # any recent version
```

---

## 2. Clone the repository

```powershell
git clone https://github.com/godwin105/Sales-Data-Analysis-System.git "Sales Data Analysis System"
cd "Sales Data Analysis System"
```

You should now see two folders: `backend/` and `frontend/`.

---

## 3. Set up the database

1. **Start MySQL** via XAMPP Control Panel.
2. Open **phpMyAdmin** at <http://localhost/phpmyadmin>.
3. Create a new database called `sales_analysis_db` (collation: `utf8mb4_unicode_ci`).
4. Select the new database → **Import** → choose `backend/schema.sql` → Go.
5. Run each migration **in order** by importing them one at a time:

| Order | File | Purpose |
|---|---|---|
| 1 | `migrations/release2_add_soft_delete.sql` | Soft-delete support for products |
| 2 | `migrations/release_decimal_quantities.sql` | Fractional quantities (e.g. 0.5 kg) |
| 3 | `migrations/uat_add_password_resets.sql` | Email-based password reset |
| 4 | `migrations/uat_add_is_active.sql` | Enable/disable cashier accounts |
| 5 | `migrations/add_email_verification.sql` | Email verification on registration |
| 6 | `migrations/add_first_last_name.sql` | First/last name fields on users |

After all imports you should see tables: `users`, `products`, `sales`, `sale_items`, `expenses`, `payments`, `notifications`, `password_resets`.

---

## 4. Set up the backend (Terminal 1)

```powershell
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# If PowerShell blocks the script, run this once first:
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Install dependencies
pip install -r requirements.txt

# Create your .env file (copy the example and fill it in)
copy .env.example .env
```

Open `.env` and fill in at minimum:

```ini
SECRET_KEY=replace-with-a-long-random-string
JWT_SECRET_KEY=replace-with-a-different-long-random-string

MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=             # XAMPP default is empty
MYSQL_DB=sales_analysis_db

CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Optional — password-reset emails. Leave commented for dry-run mode (link prints to console).
# MAIL_USERNAME=youraddress@gmail.com
# MAIL_PASSWORD=your-app-password

# Optional — ClickPesa mobile money integration.
# Get these from: ClickPesa Dashboard → Applications → your app → API Keys
# CLICKPESA_CLIENT_ID=your-client-id
# CLICKPESA_API_KEY=your-api-key
```

> **Generate strong secrets:** `python -c "import secrets; print(secrets.token_hex(32))"`

Start the Flask server:

```powershell
python app.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

Open <http://localhost:5000/api/health> — you should get `{"status": "ok"}`. Leave this terminal running.

---

## 5. Set up the frontend (Terminal 2)

Open a **new** PowerShell window (keep the backend running in the first one):

```powershell
cd path\to\Sales Data Analysis System\frontend

npm install

npm run dev
```

You should see:
```
  VITE v5.x  ready

  ➜  Local:   http://localhost:5173/
```

Open <http://localhost:5173> — you will land on the login page. Click **Create an account**, register your business, and start using the system.

---

## 6. Daily routine

After the initial setup, each time you work on the project:

1. **Start XAMPP MySQL.**
2. **Terminal 1 (backend):**
   ```powershell
   cd path\to\Sales Data Analysis System\backend
   .\venv\Scripts\Activate.ps1
   python app.py
   ```
3. **Terminal 2 (frontend):**
   ```powershell
   cd path\to\Sales Data Analysis System\frontend
   npm run dev
   ```
4. Open <http://localhost:5173>.

Press `Ctrl+C` in each terminal to stop.

---

## 7. Troubleshooting

### "ModuleNotFoundError" when running `python app.py`
You haven't activated the venv. Run `.\venv\Scripts\Activate.ps1` first — your prompt should change to `(venv)`.

### "Access denied for user 'root'@'localhost'"
Wrong MySQL password in `.env`. XAMPP's default is empty (`MYSQL_PASSWORD=`).

### "Can't connect to MySQL server"
You forgot to start MySQL. Open XAMPP Control Panel and click **Start** next to MySQL.

### "CORS error" in browser console
Check that `CORS_ORIGINS=http://localhost:5173` is in `backend/.env` and restart the Flask server.

### "Network Error" when logging in
Backend is not running. Check Terminal 1.

### `npm install` fails with permission errors
Run PowerShell as Administrator, or delete `node_modules/` and `package-lock.json`, then retry.

### Login redirects back to login immediately
JWT secret changed since you last logged in. Clear browser localStorage:
- DevTools (F12) → Application → Local Storage → Clear All
