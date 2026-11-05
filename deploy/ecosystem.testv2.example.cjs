// pm2 configuration of the V2 test environment (https://testv2.cafenoir.tn).
// Copy to /var/www/CNv2/ecosystem.config.cjs on the server (never committed: it may hold secrets),
// then: pm2 start ecosystem.config.cjs && pm2 save
//
// Independent from production: its own checkout, its own database file (DB_PATH), its own port,
// its own session cookie name (the production cookie is scoped to .cafenoir.tn).
module.exports = {
  apps: [
    {
      name: 'cnv2-test',
      cwd: '/var/www/CNv2',
      script: 'node_modules/.bin/tsx',
      args: 'server/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: '3021',
        TZ: 'Africa/Tunis',
        DB_PATH: '/var/www/CNv2/server/data/cnv2-test.sqlite3',
        SESSION_COOKIE_NAME: 'cnv2_test_session',
        // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME: customer password recovery emails
      },
    },
  ],
};
