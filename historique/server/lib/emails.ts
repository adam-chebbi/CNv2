// Transactional emails (French), inline-styled table layout so they render in Gmail/Outlook/phones.

const LOGO = 'https://cafenoir.tn/logo-icon.png';
const GREEN = '#00A86B';

const layout = (title: string, inner: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;">
  <tr><td align="center" style="padding:28px 28px 4px 28px;"><img src="${LOGO}" alt="Café Noir" width="64" style="display:block;width:64px;height:auto;border:0;"></td></tr>
  <tr><td align="center" style="padding:6px 28px 0 28px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#047857;">Historique &amp; Comptage</td></tr>
  ${inner}
  <tr><td align="center" style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px;font-size:12px;color:#9ca3af;">Café Noir · historique.cafenoir.tn<br>Email automatique, merci de ne pas y répondre.</td></tr>
</table></td></tr></table></body></html>`;

const p = (html: string) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">${html}</p>`;

export const resetPasswordEmail = (name: string, link: string, minutes: number) => {
  const subject = 'Réinitialisation de votre mot de passe — Historique & Comptage';
  const html = layout(
    subject,
    `<tr><td style="padding:20px 28px 8px 28px;">
      <h1 style="margin:0 0 14px 0;font-size:21px;color:#111827;">Mot de passe oublié ?</h1>
      ${p(`Bonjour ${name},`)}
      ${p('Nous avons reçu une demande de réinitialisation du mot de passe de votre compte. Pour choisir un nouveau mot de passe, appuyez sur le bouton ci-dessous :')}
    </td></tr>
    <tr><td align="center" style="padding:6px 28px 18px 28px;">
      <a href="${link}" style="display:inline-block;background:${GREEN};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:12px;">Choisir un nouveau mot de passe</a>
    </td></tr>
    <tr><td style="padding:0 28px 8px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#92400e;">
        Ce lien est valable <strong>${minutes} minutes</strong> et ne peut être utilisé <strong>qu'une seule fois</strong>.<br>
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe actuel reste inchangé.
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:14px 28px 22px 28px;font-size:12px;line-height:1.6;color:#6b7280;">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :<br><a href="${link}" style="color:${GREEN};word-break:break-all;">${link}</a></td></tr>`
  );
  const text = `Bonjour ${name},

Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Historique & Comptage (Café Noir).

Pour choisir un nouveau mot de passe, ouvrez ce lien :
${link}

Ce lien est valable ${minutes} minutes et ne peut être utilisé qu'une seule fois.
Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.

Café Noir — historique.cafenoir.tn`;
  return { subject, html, text };
};

export const passwordChangedEmail = (name: string, when: string) => {
  const subject = 'Votre mot de passe a été modifié — Historique & Comptage';
  const html = layout(
    subject,
    `<tr><td style="padding:20px 28px 22px 28px;">
      <h1 style="margin:0 0 14px 0;font-size:21px;color:#111827;">Mot de passe modifié</h1>
      ${p(`Bonjour ${name},`)}
      ${p(`Le mot de passe de votre compte Historique &amp; Comptage a été modifié le <strong>${when}</strong>. Par sécurité, tous vos appareils ont été déconnectés.`)}
      ${p("Si vous n'êtes pas à l'origine de ce changement, prévenez immédiatement votre responsable.")}
    </td></tr>`
  );
  const text = `Bonjour ${name},

Le mot de passe de votre compte Historique & Comptage a été modifié le ${when}. Par sécurité, tous vos appareils ont été déconnectés.
Si vous n'êtes pas à l'origine de ce changement, prévenez immédiatement votre responsable.

Café Noir — historique.cafenoir.tn`;
  return { subject, html, text };
};
