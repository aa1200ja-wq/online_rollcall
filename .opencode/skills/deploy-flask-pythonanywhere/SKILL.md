---
name: deploy-flask-pythonanywhere
description: Deploy a Flask + SQLite web application to PythonAnywhere free hosting, including GitHub setup, WSGI configuration, virtual environment setup, static files, and ongoing maintenance.
metadata:
  framework: flask
  hosting: pythonanywhere
---

## Overview

Deploy a Python Flask web application with SQLite database to PythonAnywhere's free "Beginner" tier. This skill covers the entire workflow from code push to live URL.

## System Requirements

- **Source**: A Flask app (`app.py`) in a git repository
- **Static files**: Located in `static/` subfolder
- **Dependencies**: `requirements.txt` in project root
- **Database**: SQLite (auto-created on first run via `init_db()`)

## Prerequisites

- GitHub account (free)
- PythonAnywhere account (free, "Beginner" plan at https://www.pythonanywhere.com/plans/)

---

## Step 1 — Prepare the project

Before deploying, ensure the project has these files in its root directory:

```
project/
├── app.py              # Flask application
├── requirements.txt    # Python dependencies
├── .gitignore          # Exclude *.db, __pycache__, .env, venv/
└── static/
    ├── index.html
    ├── login.html
    └── app.js
```

Key `app.py` requirements for PythonAnywhere:

```python
import os
app.secret_key = os.environ.get('SECRET_KEY', 'fallback-dev-key')
# Use PORT env var for production
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug)
```

`requirements.txt` example:

```
flask
werkzeug
gunicorn
```

---

## Step 2 — Push code to GitHub

### 2.1 Create a GitHub repository
1. Go to https://github.com and sign in
2. Click `+` → **New repository**
3. Name the repository (e.g. `online_rollcall`)
4. Keep **Public**, do NOT initialize with README
5. Click **Create repository**
6. Copy the remote URL: `https://github.com/YOUR_USERNAME/REPO_NAME.git`

### 2.2 Push from local terminal
Run these commands from the project directory:

```bash
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin main
```

### 2.3 Authentication
If git asks for credentials, create a **Personal Access Token**:

1. Go to https://github.com/settings/tokens/new
2. Note: `project-name`
3. Expiration: **No expiration**
4. Scopes: check **repo** (full control)
5. Click **Generate token** and copy the token

Then push with the token:

```bash
git remote set-url origin https://YOUR_USERNAME:TOKEN@github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin main
# Immediately reset to safe URL:
git remote set-url origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

---

## Step 3 — Set up PythonAnywhere

### 3.1 Register
1. Go to https://www.pythonanywhere.com/plans/
2. Click **Create a Beginner account** (free)
3. Fill in username, email, password
4. Verify email if required

### 3.2 Open a Bash console
1. Log in to PythonAnywhere
2. Click **Consoles** tab
3. Click **Bash** to open a Linux terminal

### 3.3 Clone the repository

In the Bash console, run:

```bash
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
cd REPO_NAME
```

### 3.4 Check Python version
PythonAnywhere offers multiple Python versions. Check what's available:

```bash
ls /usr/bin/python3.*
```

Pick a version (e.g. 3.10) and create a virtual environment:

```bash
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

> **Important**: The virtual environment Python version must match the Web app version configured in step 4.

### 3.5 Update code later
When you push changes to GitHub, update PythonAnywhere:

```bash
cd REPO_NAME
git pull
# Run migrations if needed, then reload the web app
```

---

## Step 4 — Configure the Web app on PythonAnywhere

### 4.1 Create the web app
1. Click **Web** tab
2. Click **Add a new web app**
3. **Next** → **Manual configuration** → Select **Python 3.10** (or version from step 3.4) → **Next**

### 4.2 Set Source code
In the **Code** section:
- **Source code**: `/home/YOUR_USERNAME/REPO_NAME`
- Click **Go to directory** to verify

### 4.3 Set Virtualenv
Scroll to **Virtualenv**:
- Enter: `/home/YOUR_USERNAME/REPO_NAME/venv`
- Click **Set** (verify it shows a green checkmark)
- If you see "wrong Python version", delete the venv and recreate with the correct Python version from step 3.4

### 4.4 Configure WSGI file
1. In the **Code** section, click the blue **WSGI configuration file** link
2. Delete all content and paste:

```python
import sys
path = '/home/YOUR_USERNAME/REPO_NAME'
if path not in sys.path:
    sys.path.append(path)
from app import app as application
```

3. Click **Save**

### 4.5 Set Static files
Scroll to **Static files**:
| URL | Directory |
|-----|-----------|
| `/static/` | `/home/YOUR_USERNAME/REPO_NAME/static/` |
Click **Add static file** and fill in the fields.

### 4.6 Reload
Click the green **Reload** button at the top of the Web page.

---

## Step 5 — Verify

Your site is live at: `https://YOUR_USERNAME.pythonanywhere.com`

Check these URLs:

| URL | Expected result |
|-----|----------------|
| `https://YOUR_USERNAME.pythonanywhere.com/login` | Login page (200) |
| `https://YOUR_USERNAME.pythonanywhere.com/` | Redirects to `/login` |
| `https://YOUR_USERNAME.pythonanywhere.com/api/me` | `{"error":"請先登入"}` (401) |

Test login credentials (from default database seed):

| Username | Password | Role |
|----------|----------|------|
| `teacher` | `teacher123` | 導師 |
| `admin` | `admin123` | 系統管理員 |

---

## Step 6 — Maintain

### Keep the free site alive
PythonAnywhere Beginner accounts expire after 3 months unless you log in. You'll receive an email reminder. Log in and click **Run until 1 month from today** to extend.

### View logs
If the site errors, check these in the **Web** tab:
- **Error log**: `aa1200ja.pythonanywhere.com.error.log`
- **Server log**: `aa1200ja.pythonanywhere.com.server.log`
- **Access log**: `aa1200ja.pythonanywhere.com.access.log`

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `500 Internal Server Error` after Reload | Missing or incorrect WSGI path | Verify WSGI file points to `/home/username/REPO_NAME` |
| Static files 404 (CSS/JS not loading) | Static files not configured | Add `/static/` → project `static/` mapping |
| `ModuleNotFoundError: No module named 'flask'` | Virtualenv not set or wrong Python version | Check venv path and Python version match |
| Virtualenv "wrong Python version" | venv created with different Python than web app | Delete venv, recreate with correct `python3.X` |
| `sqlite3.OperationalError: no such table` | Database not initialized | The app should auto-create tables on first run via `init_db()` |

---

## Quick Reference: Common Shell Commands

```bash
# On PythonAnywhere Bash console:
cd REPO_NAME && git pull         # Pull latest code
source venv/bin/activate         # Activate virtualenv
pip install -r requirements.txt  # Install/update dependencies
# Then go to Web tab and click Reload
```
