# Flip 7 Local Device App

This version runs fully on your device/browser.

No Firebase.
No backend.
No server calculation.
Works on GitHub Pages.

## Files

- `index.html`
- `style.css`
- `app.js`
- `cards/classic/`
- `cards/vengeance/`

## How to run on GitHub Pages

1. Create a GitHub repo.
2. Upload all files and folders from this ZIP.
3. Go to repo Settings.
4. Go to Pages.
5. Set source to `main` branch and `/root`.
6. Open the GitHub Pages URL.

## How to run locally

You can double-click `index.html`.

If images do not load locally because of browser restrictions, run a tiny local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Notes

- All game logic runs in the browser.
- The app stores no data online.
- It is designed for phone/tablet use.
- For multiplayer syncing later, Firebase can be added separately.
