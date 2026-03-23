# SOUS-AGENT 10d — COLLECTEUR D'AVIS
**Agent parent** : AGENT-10-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 1. MISSION

Le Collecteur Avis automatise la demande d'avis clients sur 5 plateformes strategiques, au timing optimal post-livraison, et gere les avis negatifs.

---

## 2. TIMING OPTIMAL

- **Demande d'avis :** J+5 a J+10 post-livraison (client a teste, memoire fraiche)
- **Jour ideal d'envoi :** Mardi ou Mercredi, 9h-11h heure client
- **Sequence :** 3 emails (J+5, J+10, J+15) + SMS optionnel (J+12)

---

## 3. PLATEFORMES CIBLES ET TAUX DE REPONSE

| Plateforme | Priorite | Raison | Taux reponse attendu |
|---|---|---|---|
| Google My Business | 1 | SEO local, confiance immediate | 5-10% |
| Trustpilot | 2 | Autorite mondiale, B2B credible | 3-5% (50% avec rappels) |
| Clutch.co | 3 | Specialiste agences web/B2B | 8-15% |
| Sortlist | 4 | Niche agences parfait | 5-10% |
| LinkedIn | 5 | Autorite + networking | 2-5% |

**Taux moyen global avec sequence automatisee :** 15-25%
**Objectif Axiom :** 30%+ (grace au timing NPS promoteur)

---

## 4. GESTION AVIS NEGATIFS

| Etape | Delai | Action |
|---|---|---|
| Detection | Immediate | Monitoring automatique plateformes |
| Reponse publique | < 24h | Template professionnel + action concrete |
| Escalade interne | < 24h | Notification CSM + manager |
| Resolution | < 7 jours | Appeler le client, proposer solution |
| Suivi | J+14 | Demander mise a jour de l'avis si resolution |

**Impact avis negatifs non traites :** -59% prospects qualifies (3 avis negatifs non traites)

---

## 5. CODE TYPESCRIPT

```typescript
// ============================================================
// COLLECTEUR AVIS
// ============================================================

interface ReviewRequest {
  client_id: string
  deal_id: string
  nps_score: number
  platform_targets: ReviewPlatform[]
  sequence_status: 'pending' | 'email_1_sent' | 'email_2_sent' | 'email_3_sent' | 'completed'
  review_received: boolean
  review_url?: string
  review_score?: number
}

type ReviewPlatform = 'google' | 'trustpilot' | 'clutch' | 'sortlist' | 'linkedin'

const REVIEW_LINKS: Record<ReviewPlatform, string> = {
  google: 'https://g.page/axiom-marketing/review',
  trustpilot: 'https://trustpilot.com/review/axiom-marketing.fr',
  clutch: 'https://clutch.co/profile/axiom-marketing',
  sortlist: 'https://sortlist.com/agency/axiom-marketing',
  linkedin: 'https://linkedin.com/company/axiom-marketing',
}

async function initiateReviewCollection(
  clientId: string,
  dealId: string,
  npsScore: number
): Promise<void> {
  // Ne demander que si NPS >= 7 (passif ou promoteur)
  if (npsScore < 7) {
    console.log(`[Avis] NPS ${npsScore} trop bas pour demande d'avis - client ${clientId}`)
    return
  }

  const client = await db.getClient(clientId)
  const deal = await db.getDeal(dealId)

  // Determiner les plateformes prioritaires
  const platforms: ReviewPlatform[] = npsScore >= 9
    ? ['google', 'trustpilot', 'clutch', 'sortlist', 'linkedin']  // Promoteur : toutes
    : ['google', 'trustpilot']                                      // Passif : les 2 principales

  // Sauvegarder la demande
  const reviewRequest: ReviewRequest = {
    client_id: clientId,
    deal_id: dealId,
    nps_score: npsScore,
    platform_targets: platforms,
    sequence_status: 'pending',
    review_received: false,
  }
  await db.saveReviewRequest(reviewRequest)

  // Programmer la sequence email
  // Email 1 : J+5 post-livraison
  await reviewEmailQueue.add(`review-email-1-${clientId}`, {
    client_id: clientId,
    email_number: 1,
    template: 'review_request_soft',
    platforms,
  }, { delay: 5 * 24 * 60 * 60 * 1000 })

  // Email 2 : J+10
  await reviewEmailQueue.add(`review-email-2-${clientId}`, {
    client_id: clientId,
    email_number: 2,
    template: 'review_request_direct',
    platforms,
  }, { delay: 10 * 24 * 60 * 60 * 1000 })

  // Email 3 : J+15 (dernier rappel)
  await reviewEmailQueue.add(`review-email-3-${clientId}`, {
    client_id: clientId,
    email_number: 3,
    template: 'review_request_final',
    platforms,
  }, { delay: 15 * 24 * 60 * 60 * 1000 })
}

async function handleNegativeReview(
  platform: ReviewPlatform,
  clientId: string,
  reviewText: string,
  reviewScore: number
): Promise<void> {
  // 1. Alert immediate
  await slack.send('#csm-urgent', {
    text: `AVIS NEGATIF sur ${platform} (score: ${reviewScore}/5)\n` +
      `Client: ${clientId}\nTexte: "${reviewText.substring(0, 200)}"`,
  })

  // 2. Creer tache intervention
  await crmService.createTask({
    type: 'call',
    priority: 'urgent',
    assignee: 'csm_manager',
    description: `Avis negatif ${platform} - Appeler client ${clientId} dans les 24h`,
    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  // 3. Preparer reponse publique (draft)
  const client = await db.getClient(clientId)
  const responseDraft = generateNegativeReviewResponse(client, reviewText, platform)
  await db.saveReviewResponseDraft(clientId, platform, responseDraft)

  // 4. Notifier Jonathan pour validation avant publication
  await slack.dm('jonathan', {
    text: `Avis negatif sur ${platform} de ${client.nom}.\n` +
      `Draft de reponse pret a valider dans le CRM.`,
  })
}

function generateNegativeReviewResponse(
  client: any,
  reviewText: string,
  platform: string
): string {
  return `Merci pour votre retour honnete, ${client.prenom}. ` +
    `Nous avons pris votre feedback au serieux et nous souhaitons ` +
    `resoudre cette situation. Contactez-moi directement a ` +
    `jonathan@axiom-marketing.fr pour en discuter. ` +
    `Nous tenons a ce que chaque client soit satisfait. ` +
    `-- Jonathan, Fondateur Axiom Marketing`
}
```

---

## 6. SEQUENCES EMAIL AVIS -- 3 TEMPLATES

### Template Avis 1 : Demande douce (J+5)

```
Objet : {{prenom}}, votre nouveau site est en ligne !

Bonjour {{prenom}},

Nous avons le plaisir de vous confirmer que votre nouveau
{{type_projet_label}} est maintenant en ligne et accessible
a {{url_projet}}.

L'equipe Axiom tient a vous remercier pour cette collaboration.
Nous esperons que le resultat depasse vos attentes !

Si vous avez besoin de support, nous sommes la.
Sinon, profitez de votre nouvel outil digital !

A bientot,

{{signature_axiom}}
```

### Template Avis 2 : Demande directe (J+10)

```
Objet : Une minute pour nous aider ?

Bonjour {{prenom}},

Vous avez eu quelques jours pour explorer votre nouveau
{{type_projet_label}}. Nous aimerions vraiment connaitre votre avis !

Si vous etes satisfait du projet, nous serions reconnaissants
si vous pouviez laisser un avis rapide sur :

--> Google : {{lien_google_review}}
--> Trustpilot : {{lien_trustpilot_review}}

Ca nous aide enormement et inspire confiance aupres
d'autres entreprises comme la votre.

Merci beaucoup !

{{signature_axiom}}
```

### Template Avis 3 : Dernier rappel (J+15)

```
Objet : Derniere tentative -- votre avis nous aiderait enormement

Bonjour {{prenom}},

Je n'ai pas eu votre avis... pas grave si vous etes deborde !

Mais serieusement, 30 secondes sur ce lien nous aideraient
enormement a aider d'autres entreprises a nous faire confiance :

{{lien_google_review}}

Merci d'avoir travaille avec nous,

{{signature_axiom}}
```
