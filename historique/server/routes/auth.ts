import { Router } from 'express';
import { z } from 'zod';
import { passwordChangedEmail, resetPasswordEmail } from '../lib/emails.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { RESET_TTL_MS, type LocalAuth } from '../lib/localAuth.js';
import type { Mailer } from '../lib/mailer.js';
import type { Store } from '../lib/store.js';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email requis.').max(160),
  password: z.string().min(1, 'Mot de passe requis.').max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(200),
  newPassword: z.string().max(200),
});

const forgotSchema = z.object({ email: z.string().trim().min(3, 'Email requis.').max(160) });
const resetSchema = z.object({ token: z.string().min(10).max(200), newPassword: z.string().max(200) });

const GENERIC_FORGOT_MESSAGE = 'Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé. Pensez à vérifier les courriers indésirables.';

// Per-device limit on reset requests, on top of the per-account limit in localAuth.
const IP_MAX_PER_HOUR = 10;
const ipHits = new Map<string, number[]>();
const ipAllowed = (ip: string): boolean => {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (hits.length >= IP_MAX_PER_HOUR) return false;
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) ipHits.clear();
  return true;
};

const sendSafely = (mailer: Mailer, store: Store, to: string, m: { subject: string; html: string; text: string }) => {
  // Sent after the response, so the answer time never reveals whether the account exists.
  setImmediate(() => {
    mailer.send({ to, ...m }).catch((e) => {
      store.log(null, { module: 'auth', action: 'erreur_email', description: `Échec d'envoi de l'email « ${m.subject} » à ${to} : ${e instanceof Error ? e.message : e}`, userName: 'Système', userId: null });
    });
  });
};

export const authRouter = (auth: LocalAuth, store: Store, mailer: Mailer, publicUrl?: string): Router => {
  const router = Router();

  router.post(
    '/forgot-password',
    asyncHandler((req, res) => {
      const { email } = forgotSchema.parse(req.body);
      if (!ipAllowed(req.ip ?? 'unknown')) throw new ApiError(429, 'Trop de demandes. Réessayez dans une heure.');
      const reset = auth.requestReset(email, req.ip ?? null);
      if (reset) {
        const base = (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const link = `${base}/reinitialiser?token=${encodeURIComponent(reset.token)}`;
        sendSafely(mailer, store, reset.email, resetPasswordEmail(reset.fullName, link, RESET_TTL_MS / 60000));
        store.log(req, { module: 'auth', action: 'demande_reinitialisation', description: `Lien de réinitialisation envoyé à ${reset.email}`, userName: reset.fullName, userId: null });
      }
      res.json({ message: GENERIC_FORGOT_MESSAGE });
    })
  );

  router.get(
    '/reset-password/check',
    asyncHandler((req, res) => {
      const token = z.string().max(200).parse(req.query.token ?? '');
      res.json({ valid: auth.checkResetToken(token) });
    })
  );

  router.post(
    '/reset-password',
    asyncHandler((req, res) => {
      const { token, newPassword } = resetSchema.parse(req.body);
      const user = auth.resetPassword(token, newPassword);
      const when = new Date().toLocaleString('fr-FR', { timeZone: process.env.TZ || 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short' });
      sendSafely(mailer, store, user.email, passwordChangedEmail(user.fullName, when));
      store.log(req, { module: 'auth', action: 'reinitialisation', description: `Mot de passe réinitialisé par email (${user.email})`, userName: user.fullName, userId: null });
      res.status(204).end();
    })
  );

  router.post(
    '/login',
    asyncHandler((req, res) => {
      const { email, password } = loginSchema.parse(req.body);
      try {
        const user = auth.login(req, res, email, password);
        store.log(req, { module: 'auth', action: 'connexion', description: `Connexion de ${user.fullName}` });
        res.json({ user });
      } catch (e) {
        store.log(req, { module: 'auth', action: 'connexion_refusee', description: `Échec de connexion (« ${email} »)`, userName: email, userId: null });
        throw e;
      }
    })
  );

  router.post(
    '/logout',
    asyncHandler((req, res) => {
      try {
        auth.requireUserAllowPendingPassword(req, res, () => undefined);
      } catch {
        // already signed out — still clear the cookie below
      }
      if (req.user) store.log(req, { module: 'auth', action: 'deconnexion', description: `Déconnexion de ${req.user.fullName}` });
      auth.logout(req, res);
      res.status(204).end();
    })
  );

  router.get(
    '/me',
    auth.requireUserAllowPendingPassword,
    asyncHandler((req, res) => {
      res.json({ user: req.user, businessDate: store.businessToday(), dateDebut: store.dateDebut(), settings: store.getSettings() });
    })
  );

  router.post(
    '/change-password',
    auth.requireUserAllowPendingPassword,
    asyncHandler((req, res) => {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      auth.changePassword(req, currentPassword, newPassword);
      store.log(req, { module: 'auth', action: 'modification', description: 'Changement du mot de passe' });
      res.status(204).end();
    })
  );

  return router;
};
