function buildPlatformLinks(reviewUrls: Record<string, string>): string {
  const labels: Record<string, string> = {
    google: 'Google',
    trustpilot: 'Trustpilot',
    clutch: 'Clutch',
    sortlist: 'Sortlist',
    linkedin: 'LinkedIn',
  };
  const entries = Object.entries(reviewUrls).filter(([, url]) => url);
  if (entries.length === 0) return '<p>Contactez-nous pour obtenir le lien.</p>';
  return entries
    .map(
      ([platform, url]) =>
        `<a href="${url}" style="display: inline-block; margin: 4px 8px 4px 0; background: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-size: 14px;">${labels[platform] ?? platform}</a>`,
    )
    .join('');
}

export function softReviewEmail(data: {
  prenom: string;
  nomProjet: string;
  reviewUrls: Record<string, string>;
}): { subject: string; htmlBody: string } {
  const subject = `${data.prenom}, votre nouveau site est en ligne !`;
  const platformLinks = buildPlatformLinks(data.reviewUrls);
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #00aa55; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #00aa55; font-size: 22px;">Votre projet ${data.nomProjet} est livré !</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Nous sommes ravis d'avoir travaillé ensemble sur <strong>${data.nomProjet}</strong>. Nous espérons que le résultat répond à vos attentes.</p>
  <p>Si vous avez quelques minutes, un avis de votre part nous aiderait énormément à faire connaître notre travail :</p>
  <div style="margin: 24px 0;">
    ${platformLinks}
  </div>
  <p style="color: #666; font-size: 14px;">Cela ne prend que 2 minutes, et c'est un vrai coup de pouce pour notre équipe.</p>
  <p style="margin-top: 32px;">Merci par avance,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function directReviewEmail(data: {
  prenom: string;
  nomProjet: string;
  reviewUrls: Record<string, string>;
}): { subject: string; htmlBody: string } {
  const subject = `Une minute pour nous aider ?`;
  const platformLinks = buildPlatformLinks(data.reviewUrls);
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Bonjour ${data.prenom} — une petite faveur ?</h1>
  </div>
  <p>Vous avez travaillé avec nous sur <strong>${data.nomProjet}</strong> et nous espérons que vous êtes satisfait du résultat.</p>
  <p>Pourriez-vous prendre une minute pour laisser un avis ? Cela nous aide directement à développer notre activité et à continuer à offrir un service de qualité.</p>
  <div style="margin: 24px 0;">
    ${platformLinks}
  </div>
  <p>Votre retour compte vraiment pour nous.</p>
  <p style="margin-top: 32px;">Cordialement,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function finalReviewEmail(data: {
  prenom: string;
  nomProjet: string;
  reviewUrls: Record<string, string>;
}): { subject: string; htmlBody: string } {
  const subject = `Dernière tentative — votre avis nous aiderait énormément`;
  const platformLinks = buildPlatformLinks(data.reviewUrls);
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #ff9900; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #ff9900; font-size: 22px;">Bonjour ${data.prenom}, c'est notre dernier message</h1>
  </div>
  <p>Je vous contacte une dernière fois concernant votre projet <strong>${data.nomProjet}</strong>.</p>
  <p>Si vous avez 60 secondes, un avis sur l'une de ces plateformes serait un cadeau inestimable pour notre petite équipe :</p>
  <div style="margin: 24px 0;">
    ${platformLinks}
  </div>
  <p>Si vous n'avez pas le temps ou si quelque chose ne s'est pas passé comme prévu, n'hésitez pas à répondre directement à cet email — je lirai votre message personnellement.</p>
  <p style="color: #666; font-size: 13px;">Promis, c'est notre dernier rappel.</p>
  <p style="margin-top: 32px;">Avec gratitude,<br><strong>Jonathan<br>Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}
