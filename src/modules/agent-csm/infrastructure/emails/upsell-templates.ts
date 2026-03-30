export function ecommerceUpsellEmail(data: {
  prenom: string;
  companyName: string;
  estimatedValue?: number;
}): { subject: string; htmlBody: string } {
  const subject = `Votre trafic web croît — et si on captait ces ventes ?`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Votre trafic croît — captez ces ventes !</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Depuis le lancement de votre site <strong>${data.companyName}</strong>, votre trafic progresse régulièrement. C'est une excellente nouvelle — et c'est exactement le moment d'en tirer parti.</p>
  <p>Beaucoup de nos clients dans votre situation ont transformé ce trafic en revenus directs grâce à une boutique e-commerce Shopify intégrée.</p>
  <p>Résultats observés chez des clients similaires :</p>
  <ul>
    <li>+30 à 50% de conversions supplémentaires</li>
    <li>Panier moyen optimisé dès le premier mois</li>
    <li>Intégration fluide avec votre site actuel</li>
  </ul>
  ${data.estimatedValue ? `<p>Nous estimons la valeur de ce projet autour de <strong>${data.estimatedValue.toLocaleString('fr-FR')} €</strong>, avec un retour sur investissement généralement visible en 3 à 6 mois.</p>` : ''}
  <p>Seriez-vous disponible 20 minutes pour qu'on en discute ?</p>
  <p style="margin-top: 32px;">Cordialement,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function trackingUpsellEmail(data: {
  prenom: string;
  companyName: string;
  conversionPrincipale?: string;
  estimatedValue?: number;
}): { subject: string; htmlBody: string } {
  const conversion = data.conversionPrincipale ?? 'vos conversions clés';
  const subject = `Une question : est-ce que vous trackez ${conversion} ?`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #ff6600; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #ff6600; font-size: 22px;">Savez-vous vraiment ce qui convertit ?</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Une question directe : est-ce que vous trackez actuellement <strong>${conversion}</strong> sur <strong>${data.companyName}</strong> ?</p>
  <p>Si la réponse est "pas vraiment" ou "on essaie avec GA4 mais ce n'est pas fiable" — vous n'êtes pas seul. C'est le cas pour 80% de nos clients avant qu'on mette en place le tracking server-side.</p>
  <p>Le tracking server-side permet :</p>
  <ul>
    <li>Données fiables même avec AdBlock ou iOS 17+</li>
    <li>Attribution publicitaire correcte (Meta, Google Ads)</li>
    <li>Conformité RGPD sans perte de signal</li>
  </ul>
  ${data.estimatedValue ? `<p>Notre forfait commence à <strong>${data.estimatedValue.toLocaleString('fr-FR')} €</strong> avec une mise en place en moins de 2 semaines.</p>` : ''}
  <p>Je peux vous montrer ce que vous manquez actuellement avec un audit gratuit de 30 minutes. Intéressé ?</p>
  <p style="margin-top: 32px;">À bientôt,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function renewalUpsellEmail(data: {
  prenom: string;
  companyName: string;
  renewalDate?: string;
  nextProductTarget?: string;
  estimatedValue?: number;
}): { subject: string; htmlBody: string } {
  const subject = `Votre renouvellement approche — et une idée pour l'an 2`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #00aa55; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #00aa55; font-size: 22px;">Bilan de l'an 1 et vision an 2</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>${data.renewalDate ? `Votre contrat arrive à renouvellement le <strong>${data.renewalDate}</strong>.` : "Votre contrat approche de son terme."} C'est un bon moment pour faire le bilan de ce qu'on a accompli ensemble pour <strong>${data.companyName}</strong>.</p>
  <p>Cette première année, vous avez posé des bases solides. Pour l'an 2, nous avons une idée qui pourrait nettement amplifier les résultats obtenus :</p>
  ${data.nextProductTarget ? `<p style="background: #e8f4e8; border-radius: 4px; padding: 12px; font-weight: bold;">${data.nextProductTarget}</p>` : ''}
  ${data.estimatedValue ? `<p>Investissement estimé : <strong>${data.estimatedValue.toLocaleString('fr-FR')} €</strong>, avec un ROI observable dès les 6 premiers mois.</p>` : ''}
  <p>Je vous propose un appel de 30 minutes pour vous présenter cette idée en détail. Quelles sont vos disponibilités la semaine prochaine ?</p>
  <p style="margin-top: 32px;">Avec plaisir,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}
