# Café Noir — caisse et gestion (V2)

Logiciel de caisse et de gestion de Café Noir (Menzah 9, Tunis), réalisé par Creative Comet.
Application web responsive : ordinateur, tablette, smartphone.

## Contenu du dépôt

| Dossier | Application |
|---|---|
| `src/`, `server/` | Système de gestion et de caisse (React + Express + SQLite) |
| `src/pos/` | Écrans de caisse et de service : caisse, plan de salle, cuisine/bar, actions à traiter, tickets, sessions, réservations, annulations, paramétrage |
| `src/client/` | Pages clients publiques : menu QR de table (`/t/…`), compte client (`/compte`), réservation (`/reserver`) |
| `historique/` | Application « Historique & Comptage » |
| `showcase/` | Site vitrine |
| `docs-site/` | Site de documentation privé |
| `deploy/` | Configurations nginx |

## Démarrer en local

Prérequis : Node.js 22 LTS et les outils de compilation pour `better-sqlite3`.

```bash
npm install
npm run dev:full      # interface http://localhost:3000, API http://localhost:4000
```

Au premier lancement, la base `server/data/cafenoir.sqlite3` est créée avec des données de
démonstration ; le compte Super Admin se connecte avec le CIN `12345678` (mot de passe identique,
à changer à la première connexion).

## Vérifier

```bash
npm run check         # types (interface + serveur) et tests d'API
npm test              # tests uniquement
npm run build         # build de production
```

Les tests démarrent l'application sur une base SQLite jetable (`DB_PATH`) et rejouent les scénarios
de recette du cahier des charges (vente comptoir, monnaie à rendre, règlements multiples, double
appui, déstockage unique, commande QR, annulation à double validation, fidélité, réservations…).

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT` | Port de l'API (3011 en production) |
| `NODE_ENV` | `production` en ligne |
| `TZ` | `Africa/Tunis` (dates et heures justes) |
| `SESSION_COOKIE_DOMAIN` | `.cafenoir.tn` en production |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME` | Emails de récupération de mot de passe des comptes clients |
| `DB_PATH` | Base SQLite alternative (tests) |

Les fichiers `.env*` ne sont jamais versionnés.
