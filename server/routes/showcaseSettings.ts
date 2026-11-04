import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { toJson } from '../db/json.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { readShowcaseInfo } from '../lib/showcaseInfo.js';
import {
  SHOWCASE_SETTINGS_KEY,
  DEFAULT_SHOWCASE_SITE_INFO,
  extractEmbedUrl,
  validateShowcaseSiteInfo,
  type ShowcaseSiteInfo,
} from '../../src/data/showcaseSettingsModel.js';

// Content of the public site (cafenoir.tn), managed from Paramètres → "Site vitrine". Read/update/
// reset of one record; the public site reads it through GET /api/public/site-info (routes/public.ts).
// Same permission as the other general settings.
export const showcaseSettingsRouter = Router();
showcaseSettingsRouter.use(requireAuth);

// Shapes only — the business rules (formats, https-only links, Google embed host, times…) live in
// validateShowcaseSiteInfo so the form and the server can never disagree.
const bodySchema = z.object({
  tagline: z.string().max(400),
  address: z.string().max(600),
  city: z.string().max(400),
  postalCode: z.string().max(40),
  phone: z.string().max(80),
  email: z.string().max(200),
  hours: z.string().max(600),
  opensAt: z.string().max(10),
  closesAt: z.string().max(10),
  mapEmbedUrl: z.string().max(6000),
  mapUrl: z.string().max(3000),
  socials: z.array(z.object({ platform: z.string().max(30), href: z.string().max(3000) })).max(20),
});

showcaseSettingsRouter.get(
  '/',
  requirePermission('settings:manage'),
  asyncHandler((_req, res) => {
    res.json(readShowcaseInfo());
  })
);

showcaseSettingsRouter.put(
  '/',
  requirePermission('settings:manage'),
  asyncHandler((req, res) => {
    const body = bodySchema.parse(req.body);
    const info: ShowcaseSiteInfo = {
      tagline: body.tagline.trim(),
      address: body.address.trim(),
      city: body.city.trim(),
      postalCode: body.postalCode.trim(),
      phone: body.phone.trim(),
      email: body.email.trim(),
      hours: body.hours.trim(),
      opensAt: body.opensAt.trim(),
      closesAt: body.closesAt.trim(),
      // Forgiving: the whole <iframe> snippet from Google is accepted, only its src is kept.
      mapEmbedUrl: extractEmbedUrl(body.mapEmbedUrl),
      mapUrl: body.mapUrl.trim(),
      socials: body.socials.map((s) => ({ platform: s.platform as ShowcaseSiteInfo['socials'][number]['platform'], href: s.href.trim() })),
    };
    const errors = validateShowcaseSiteInfo(info);
    if (errors.length > 0) throw new ApiError(400, errors.join(' '));

    const now = new Date().toISOString();
    const user = req.user!.fullName;
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (@key, @value, @updated_at, @updated_by)
       ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at, updated_by = @updated_by`
    ).run({ key: SHOWCASE_SETTINGS_KEY, value: toJson(info), updated_at: now, updated_by: user });

    recordActivity('Paramètres', 'Modification', 'Informations du site vitrine mises à jour', user);
    res.json(readShowcaseInfo());
  })
);

// "Delete" of the record: everything goes back to the built-in defaults.
showcaseSettingsRouter.delete(
  '/',
  requirePermission('settings:manage'),
  asyncHandler((req, res) => {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(SHOWCASE_SETTINGS_KEY);
    recordActivity('Paramètres', 'Suppression', 'Informations du site vitrine réinitialisées (valeurs par défaut)', req.user!.fullName);
    res.json({ info: { ...DEFAULT_SHOWCASE_SITE_INFO, socials: DEFAULT_SHOWCASE_SITE_INFO.socials.map((s) => ({ ...s })) }, updatedAt: null, updatedBy: null });
  })
);
