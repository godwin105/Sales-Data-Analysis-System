# Git Workflow Cheat Sheet

This is the daily routine for committing and merging code on this project. Everyone on the team follows the same flow so we don't end up with tangled history again.

## 🌳 Branching rules

- **Never commit directly to `main`.**
- One branch per feature/fix. Use a clear prefix:
  - `feature/<short-name>` — new functionality
  - `fix/<short-name>` — bug fixes
  - `docs/<short-name>` — documentation only
  - `chore/<short-name>` — config, deps, refactors
- Delete the branch after the PR is merged.

## 📅 Daily routine

### 1. Start your day — sync with `main`

```powershell
cd "D:\4th Year\FYP\Sales Data Analysis System"
git checkout main
git pull origin main
```

### 2. Create a new branch for what you're working on

```powershell
git checkout -b feature/insights-export-csv
```

### 3. Work normally

Edit code, test, commit small chunks as you go:

```powershell
git status                          # see what changed
git add <file1> <file2>             # stage specific files (preferred)
# or:
git add .                           # stage everything (be careful)

git commit -m "Add CSV export to insights page"
```

> 💡 **Commit message style**: present tense, imperative. "Add foo", "Fix bar", "Update baz" — not "Added", "Fixed", "Updates".

### 4. Push your branch to GitHub

First push of the branch:
```powershell
git push -u origin feature/insights-export-csv
```

Subsequent pushes:
```powershell
git push
```

### 5. Open a Pull Request on GitHub

1. Go to <https://github.com/godwin105/Sales-Data-Analysis-System>
2. You should see a yellow banner: **"Compare & pull request"** — click it.
3. Write a clear title + description (what changed, why, anything reviewers should test).
4. Tag a teammate as reviewer.
5. Wait for review → merge → done.

### 6. After your PR is merged

```powershell
git checkout main
git pull origin main                # pull the merged changes
git branch -d feature/insights-export-csv      # delete local branch
git push origin --delete feature/insights-export-csv   # delete remote branch
```

---

## 🔍 Common situations

### "I started on the wrong branch"

You committed to `main` by accident, or you forgot to checkout a feature branch. Move your commits to a new branch:

```powershell
# You're on main with uncommitted changes
git checkout -b feature/my-thing       # creates branch with current state
# Continue working from there
```

If you already committed to `main` locally (but haven't pushed):

```powershell
git branch feature/my-thing            # save current state to a branch
git checkout main
git reset --hard origin/main           # rewind main to match remote
git checkout feature/my-thing          # continue here
```

### "My branch is behind main"

Your branch was created days ago and `main` has moved on:

```powershell
git checkout main
git pull origin main
git checkout feature/my-thing
git merge main                          # bring main's changes into your branch
# Resolve any conflicts, commit, then push
```

### "I want to undo my last commit (not pushed yet)"

```powershell
git reset --soft HEAD~1                 # undo commit, keep changes staged
git reset HEAD~1                        # undo commit, keep changes unstaged
git reset --hard HEAD~1                 # undo commit AND throw away changes ⚠️
```

### "I committed `.env` by accident"

```powershell
git rm --cached backend/.env            # untrack but don't delete
git commit -m "Stop tracking .env"
git push
# Then rotate the secrets in .env because they're now in git history!
```

### "The repo is broken / I'm stuck"

Don't panic and don't `force push`. Ask Godwin first.

If everything is truly broken locally but the remote is fine, the nuclear option is:

```powershell
cd ..
Remove-Item -Recurse -Force "Sales Data Analysis System"
git clone https://github.com/godwin105/Sales-Data-Analysis-System.git "Sales Data Analysis System"
# Re-run venv + npm install setup
```

---

## 🚫 Things we never do

- ❌ `git push --force` to `main` (or to anyone else's branch)
- ❌ Committing `.env`, `node_modules/`, `venv/`, or `__pycache__/`
- ❌ Committing IDE settings (`.vscode/`, `.idea/`) unless they're project-wide configs we agreed on
- ❌ Committing huge generated files (PDFs, ZIPs, video) — link to them in chat instead
- ❌ Merging your own PR without at least one teammate looking at it (unless it's a tiny doc fix)

---

## 📋 PR checklist

Before opening a PR, run through:

- [ ] App still runs locally (both `python app.py` and `npm run dev`)
- [ ] Backend: ran any new code path at least once (no syntax errors)
- [ ] Frontend: page renders without console errors
- [ ] No `.env` files staged
- [ ] No `node_modules/`, `venv/`, or `__pycache__/` staged
- [ ] Commit messages are clear
- [ ] Branch is up-to-date with `main`

---

## 🆘 Quick reference

| What I want to do | Command |
|---|---|
| See current branch | `git branch --show-current` |
| See all branches | `git branch -a` |
| See uncommitted changes | `git status` |
| See changes in a file | `git diff <file>` |
| Discard changes in a file | `git checkout -- <file>` |
| See commit history | `git log --oneline -20` |
| See history with branches | `git log --oneline --graph --all -20` |
| Stash changes temporarily | `git stash` then `git stash pop` |
| Rename current branch | `git branch -m new-name` |
