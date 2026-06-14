# Biashara App Favicon — Installation Guide

## Files included
| File | Use |
|------|-----|
| `favicon.svg` | Modern browsers (scalable, sharpest) — primary favicon |
| `favicon.ico` | Legacy browsers (multi-res 16/32/48) |
| `favicon-16.png` | Browser tab (small) |
| `favicon-32.png` | Browser tab / taskbar |
| `favicon-180.png` / `apple-touch-icon.png` | iPhone/iPad home screen |
| `favicon-192.png` | Android home screen |
| `favicon-512.png` | PWA splash / app stores |

## Step 1 — Copy files into your project
Copy ALL the files into `frontend/public/`:

```
frontend/public/favicon.svg
frontend/public/favicon.ico
frontend/public/apple-touch-icon.png
frontend/public/favicon-32.png
frontend/public/favicon-16.png
frontend/public/favicon-192.png
frontend/public/favicon-512.png
```

(You can overwrite the existing favicon.svg that's already there.)

## Step 2 — Update frontend/index.html
In the `<head>` section, replace any existing favicon `<link>` with these lines:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

## Step 3 — Test
1. Stop the dev server (Ctrl+C) and restart: `npm run dev`
2. Open http://localhost:5173
3. Hard refresh: Ctrl+Shift+R (favicons cache aggressively)
4. Check the browser tab — you should see the navy chart icon

If you still see the old icon, close the tab completely and open a new one,
or clear the browser cache.

## Git workflow (your team convention)
```powershell
git checkout main
git pull origin main
git checkout -b feature/add-project-favicon
# copy the files in, edit index.html
git add frontend/public/ frontend/index.html
git status
git commit -m "Add Biashara App favicon (SVG + PNG + ICO for all browsers)"
git push -u origin feature/add-project-favicon
```
Then open a PR and have a teammate merge.
