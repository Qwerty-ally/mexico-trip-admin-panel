# Trip Control — admin panel

Hidden management console for the Mexico trip site. Not linked from the public site anywhere — you get here only by opening this file/URL directly. Password-gated (`mexico2026`) — see the security note below.

## Setup

1. Open `firebase-config.js` and paste in the **exact same** config values you used in `C:\Users\finns\mexico-trip\firebase-config.js`. Same Firebase project = same trip data.
2. Open `index.html` (double-click, or serve it — same options as the main site's README).
3. Enter the password: `mexico2026`.

If you want it reachable by URL (not just on your own computer), deploy this folder somewhere too — it does **not** need to be the same host as the public site, since all the data lives in Firestore, not on whatever serves the HTML. A second free Firebase Hosting site, Netlify Drop, or just running it locally when you need it are all fine. Just don't link to it from anywhere public.

## What it does

- **Activities** — every activity across all days in one table; edit or delete any of them.
- **Leaderboard** — every activity ranked by votes, medals for the top 3.
- **Attendance** — per-person breakdown of going/maybe/can't, votes, and comments.
- **Danger zone** — export a full JSON backup, or wipe all trip data (type `RESET` to confirm).
- Editing an activity also shows its comments, with a delete button on each — for moderation.

## About the password

`mexico2026` is checked in the page's own JavaScript, which means it's visible to anyone who looks at the page source — this keeps the family from wandering in by accident, it is **not** real security. Don't put anything sensitive behind it, and don't post this folder's link publicly.
