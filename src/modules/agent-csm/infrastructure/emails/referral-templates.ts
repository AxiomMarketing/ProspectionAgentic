export function vipInvitationEmail(data: {
  prenom: string;
  referralCode: string;
  commissionPct: number;
  referralLink: string;
}): { subject: string; htmlBody: string } {
  const subject = `${data.prenom}, rejoignez le programme VIP Axiom`;
  const commissionDisplay = Math.round(data.commissionPct * 100);
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc, #004499); border-radius: 8px; padding: 32px; margin-bottom: 24px; text-align: center;">
    <h1 style="margin: 0; color: #fff; font-size: 26px;">Programme Ambassadeur VIP Axiom</h1>
    <p style="color: #cce0ff; margin-top: 8px;">Réservé à nos meilleurs clients</p>
  </div>
  <p>Bonjour <strong>${data.prenom}</strong>,</p>
  <p>En reconnaissance de la confiance que vous nous accordez, nous vous invitons à rejoindre notre programme ambassadeur exclusif.</p>
  <div style="background: #f0f7ff; border-left: 4px solid #0066cc; padding: 20px; margin: 24px 0; border-radius: 4px;">
    <h2 style="margin: 0 0 12px; color: #0066cc; font-size: 18px;">Votre avantage</h2>
    <p style="margin: 0; font-size: 16px;">Gagnez <strong>${commissionDisplay}% de commission</strong> sur chaque client que vous nous recommandez.</p>
  </div>
  <p>Votre code de parrainage personnel :</p>
  <div style="background: #f8f9fa; border: 2px dashed #0066cc; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
    <span style="font-family: monospace; font-size: 22px; font-weight: bold; color: #0066cc; letter-spacing: 2px;">${data.referralCode}</span>
  </div>
  <p style="text-align: center; margin-top: 24px;">
    <a href="${data.referralLink}" style="display: inline-block; background: #0066cc; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Rejoindre le programme</a>
  </p>
  <p style="color: #666; font-size: 14px; margin-top: 32px;">Pas d'engagement, pas de limite — chaque recommandation compte.</p>
  <p style="margin-top: 32px;">Avec toute notre gratitude,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function socialProofEmail(data: {
  prenom: string;
  nbReferrersActifs: number;
  montantExemple: number;
}): { subject: string; htmlBody: string } {
  const subject = `Un de vos pairs a déjà gagné ${data.montantExemple} EUR grâce à Axiom`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #00aa55; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #00aa55; font-size: 22px;">Ils gagnent en recommandant Axiom</h1>
  </div>
  <p>Bonjour <strong>${data.prenom}</strong>,</p>
  <p>Saviez-vous que <strong>${data.nbReferrersActifs} ambassadeurs</strong> comme vous ont déjà utilisé notre programme de parrainage ?</p>
  <div style="background: #f0fff4; border-left: 4px solid #00aa55; padding: 20px; margin: 24px 0; border-radius: 4px;">
    <p style="margin: 0; font-size: 16px;">L'un d'eux a récemment gagné <strong>${data.montantExemple} EUR</strong> en recommandant simplement Axiom à un partenaire commercial.</p>
  </div>
  <p>Vous aussi, partagez votre expérience avec votre réseau et soyez récompensé pour chaque mission signée.</p>
  <p style="color: #666; font-size: 14px;">Votre code ambassadeur est actif dans votre espace client.</p>
  <p style="margin-top: 32px;">À très bientôt,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function reminderEmail(data: {
  prenom: string;
  referralLink: string;
}): { subject: string; htmlBody: string } {
  const subject = `Vous connaissez quelqu'un qui a besoin d'un site web ?`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Un coup de pouce pour votre réseau ?</h1>
  </div>
  <p>Bonjour <strong>${data.prenom}</strong>,</p>
  <p>Vous connaissez peut-être quelqu'un qui recherche :</p>
  <ul>
    <li>Un site vitrine professionnel</li>
    <li>Une boutique e-commerce Shopify</li>
    <li>Une application mobile Flutter</li>
    <li>Un outil métier sur-mesure</li>
  </ul>
  <p>En partageant votre lien ambassadeur, vous l'aidez à trouver la bonne agence <em>et</em> vous touchez une commission sur la mission signée.</p>
  <p style="text-align: center; margin-top: 24px;">
    <a href="${data.referralLink}" style="display: inline-block; background: #0066cc; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Partager mon lien</a>
  </p>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">Aucune obligation, juste une opportunité de rendre service et d'être récompensé.</p>
  <p style="margin-top: 32px;">Merci pour votre confiance,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}
