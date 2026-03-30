export function welcomeEmail(data: {
  prenom: string;
  typeProjet: string;
  pmName?: string;
}): { subject: string; htmlBody: string } {
  const subject = `Bienvenue chez Axiom, ${data.prenom} ! Votre projet ${data.typeProjet} démarre`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 24px;">Bienvenue chez Axiom, ${data.prenom} !</h1>
  </div>
  <p>Nous sommes ravis de démarrer votre projet <strong>${data.typeProjet}</strong> avec vous.</p>
  <p>Votre équipe est mobilisée pour vous offrir la meilleure expérience possible. ${data.pmName ? `Votre chef de projet attitré est <strong>${data.pmName}</strong>.` : ''}</p>
  <p>Voici les prochaines étapes :</p>
  <ul>
    <li>Création de votre espace de travail partagé</li>
    <li>Planification du kick-off sous 48h</li>
    <li>Email de préparation avant la réunion de lancement</li>
  </ul>
  <p>N'hésitez pas à nous contacter pour toute question.</p>
  <p style="margin-top: 32px;">À très bientôt,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function preKickoffEmail(data: {
  prenom: string;
  nomProjet: string;
  kickoffDate: string;
}): { subject: string; htmlBody: string } {
  const subject = `Kick-off dans 2 jours ! 3 choses à préparer | ${data.nomProjet}`;
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Votre kick-off approche !</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Votre réunion de lancement pour <strong>${data.nomProjet}</strong> est prévue le <strong>${data.kickoffDate}</strong>.</p>
  <p>Pour en tirer le meilleur parti, préparez ces 3 points :</p>
  <ol>
    <li><strong>Vos objectifs prioritaires</strong> — qu'attendez-vous de ce projet dans les 30 premiers jours ?</li>
    <li><strong>Vos contraintes techniques</strong> — accès, outils existants, intégrations nécessaires</li>
    <li><strong>Vos interlocuteurs clés</strong> — qui doit être impliqué côté client ?</li>
  </ol>
  <p>Nous avons hâte de démarrer cette aventure avec vous !</p>
  <p style="margin-top: 32px;">À bientôt,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function kickoffRecapEmail(data: {
  prenom: string;
  nomProjet: string;
  decisions: string[];
  nextSteps: string[];
}): { subject: string; htmlBody: string } {
  const subject = `Recap kick-off + prochaines étapes | ${data.nomProjet}`;
  const decisionsHtml =
    data.decisions.length > 0
      ? `<ul>${data.decisions.map((d) => `<li>${d}</li>`).join('')}</ul>`
      : '<p>À compléter après le kick-off.</p>';
  const nextStepsHtml =
    data.nextSteps.length > 0
      ? `<ol>${data.nextSteps.map((s) => `<li>${s}</li>`).join('')}</ol>`
      : '<p>À compléter après le kick-off.</p>';
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Recap de votre kick-off — ${data.nomProjet}</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Merci pour ce kick-off productif ! Voici le résumé de notre échange.</p>
  <h2 style="color: #0066cc; font-size: 18px;">Décisions prises</h2>
  ${decisionsHtml}
  <h2 style="color: #0066cc; font-size: 18px;">Prochaines étapes</h2>
  ${nextStepsHtml}
  <p>N'hésitez pas à nous revenir si vous avez des questions ou des ajouts.</p>
  <p style="margin-top: 32px;">Cordialement,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function milestoneEmail(data: {
  prenom: string;
  typeProjet: string;
  deliverableUrl?: string;
}): { subject: string; htmlBody: string } {
  const subject = `Premier aperçu : votre ${data.typeProjet} prend forme !`;
  const deliverableSection = data.deliverableUrl
    ? `<p><a href="${data.deliverableUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Voir le livrable</a></p>`
    : '';
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #00aa55; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #00aa55; font-size: 22px;">Votre premier livrable est prêt !</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Bonne nouvelle ! Votre projet <strong>${data.typeProjet}</strong> avance bien et nous avons un premier livrable à vous présenter.</p>
  ${deliverableSection}
  <p>Votre retour est précieux pour nous permettre d'affiner les prochaines étapes. N'hésitez pas à nous faire part de vos commentaires.</p>
  <p style="margin-top: 32px;">Avec enthousiasme,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}

export function monthlyCheckinEmail(data: {
  prenom: string;
  nomProjet: string;
  completed: string[];
  inProgress: string[];
  upcoming: string[];
}): { subject: string; htmlBody: string } {
  const subject = `Point mensuel : avancement de votre projet ${data.nomProjet}`;
  const completedHtml =
    data.completed.length > 0
      ? `<ul>${data.completed.map((item) => `<li>&#10003; ${item}</li>`).join('')}</ul>`
      : '<p><em>Aucun élément complété ce mois-ci.</em></p>';
  const inProgressHtml =
    data.inProgress.length > 0
      ? `<ul>${data.inProgress.map((item) => `<li>&#8594; ${item}</li>`).join('')}</ul>`
      : '<p><em>Aucun élément en cours.</em></p>';
  const upcomingHtml =
    data.upcoming.length > 0
      ? `<ul>${data.upcoming.map((item) => `<li>&#9675; ${item}</li>`).join('')}</ul>`
      : '<p><em>Aucune étape planifiée prochainement.</em></p>';
  const htmlBody = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-left: 4px solid #0066cc; padding: 20px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: #0066cc; font-size: 22px;">Point mensuel — ${data.nomProjet}</h1>
  </div>
  <p>Bonjour ${data.prenom},</p>
  <p>Voici le bilan mensuel de votre projet <strong>${data.nomProjet}</strong>.</p>
  <h2 style="color: #00aa55; font-size: 18px;">Réalisé ce mois-ci</h2>
  ${completedHtml}
  <h2 style="color: #ff9900; font-size: 18px;">En cours</h2>
  ${inProgressHtml}
  <h2 style="color: #0066cc; font-size: 18px;">Prochaines étapes</h2>
  ${upcomingHtml}
  <p>N'hésitez pas à nous contacter pour faire un point plus approfondi.</p>
  <p style="margin-top: 32px;">Cordialement,<br><strong>L'équipe Axiom Marketing</strong></p>
</body>
</html>`;
  return { subject, htmlBody };
}
