# Historique & Comptage — Café Noir

A one-screen **cash terminal** for the café staff, at **historique.cafenoir.tn**. It is built for people who are not comfortable with computers: there is no menu, just one screen.

1. Pick the **date** (header: from the app's first day up to today) and the **service** (Matin / Soir).
2. Enter the **chiffre d'affaires**.
3. Add the **dépenses du jour** paid with the till's cash (what for + amount).
4. The screen shows what **must be in the till**: chiffre d'affaires − dépenses.
5. **Comptage**: enter the **TPE** total and the **ticket resto** total; the **espèces** are calculated automatically (the rest).
6. **Enregistrer**. Saving again corrects the same service. Every save keeps the previous values in an audit trail (`activity_log` table).

The **Historique** button opens a fullscreen view of past services with totals (CA, dépenses, caisse, TPE, ticket resto, espèces), period filters and CSV export.

The **Avance** button (next to Historique) records **avances au personnel**, completely separate from the caisse: an avance never changes the chiffre d'affaires, the dépenses or the espèces. Each one keeps the employee's name, the amount, an optional reason, and the date and time — taken from the clock, or typed by hand by ticking "Saisir la date et l'heure manuellement" (never in the future). Employee names are remembered in this app's own database (`avance_employes`). After a confirmation screen, an avance can no longer be edited. It can be deleted only within 24 h, by the person who entered it (or a supervisor), after re-entering their password. After 24 h it can never be deleted, and a deletion only hides it: the row stays in the database. The *Liste des avances* tab filters by period and employee, shows totals per employee and exports to CSV.

A save made without network is kept on the phone and sent automatically when the connection returns. The app installs as the PWA "Historique et Comptage Café Noir".

Staff can correct today and the previous 2 days. Older days can only be changed by accounts with `historique:supervise`.

## Accounts: independent from the main app

Since 2026-10-17 Historique has **its own accounts** (`users`, `sessions` tables in its own database) and shares nothing with the main Café Noir app:

- **Login:** email + password. Passwords are scrypt-hashed. 5 wrong attempts lock the account for 15 minutes.
- **Sessions:** the session lives in an httpOnly cookie `hist_session`, bound to historique.cafenoir.tn only. A session expires after 30 days without use.
- **Temporary passwords:** an account created with one (`must_change_password`) must choose a new password at its first login, and every API call is refused until then. Changing a password signs out the account's other devices.
- **Roles:** `admin` can correct any past day and delete anyone's avance within 24 h. `gerant` can correct the last 3 days and delete only their own avances within 24 h.
- **Forgotten password:** "Mot de passe oublié ?" on the login screen sends an email with a link (`/reinitialiser?token=…`) valid **30 minutes**, **single use**. Only the token's SHA-256 is stored (`password_resets`). The answer is identical whether or not the email has an account. Limits: 3 emails per account per hour and 10 requests per device per hour. Setting the new password unlocks the account, clears any temporary-password flag, signs out every device and sends a "mot de passe modifié" confirmation. Email goes through SMTP configured by environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`, `PUBLIC_URL` — see `.env.example`), set on the server only, never in git.
- **Fresh start:** `server/scripts/reset-fresh.ts --confirm` wipes all data and creates the accounts given as JSON on stdin, so passwords never appear in the repository (see the script header). **Back up the database first.**

## Development

```bash
npm install
npm run dev:full        # vite on :3100 + API on :4100
# create a local account (fresh DB):
echo '[{"email":"admin@local.tn","fullName":"Admin","password":"temporaire","role":"admin","mustChangePassword":true}]' | npx tsx server/scripts/reset-fresh.ts --confirm
npm test                # end-to-end API tests on a throwaway DB
npm run build           # typecheck + production build (dist/ + service worker + manifest)
```

Amounts are stored as integer **millimes**. Business rules shared by server and client live in `shared/model.ts`.

## Production

Deployed on the VM alongside the main app:

- pm2 app **`historique`** (in the VM's untracked `/var/www/CNsystemmanagement/ecosystem.config.cjs`): `PORT=3012`, `NODE_ENV=production`, `TZ=Africa/Tunis`.
- The Cloudflare tunnel routes `historique.cafenoir.tn` **directly to `http://localhost:3012`** (no nginx hop). `deploy/historique.cafenoir.tn.nginx.conf` is kept in case you prefer to route through nginx (`localhost:80`) like the other sites.
- DNS: a proxied CNAME `historique` → `a84d343d-c53e-4ae6-be88-77768a90d97c.cfargotunnel.com`.
- Update: `cd /var/www/CNsystemmanagement && git pull --ff-only origin main && cd historique && npm ci && npm run build && pm2 restart historique`.
- Back up `historique/server/data/` (database and `uploads/` receipt photos) alongside the main database.
