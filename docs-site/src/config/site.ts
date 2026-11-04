// This is a private, authenticated-only site (see PLAN_SITE_DOCUMENTATION_PRIVE.md at the repo
// root) — the real access gate is enforced by nginx (auth_request) on the production domain,
// never in this client code. MAIN_APP_URL is only used for the "Retour à l'application" link and
// the private-access notice's copy.
export const MAIN_APP_URL = 'https://system.cafenoir.tn';

// The public-facing menu/showcase — linked from the header so someone documenting a customer-
// facing flow can jump straight to what a customer actually sees, without leaving the docs.
export const SHOWCASE_URL = 'https://cafenoir.tn';
