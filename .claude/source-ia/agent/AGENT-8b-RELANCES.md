# SOUS-AGENT 8b — RELANCEUR DE DEALS
**Agent parent** : AGENT-8-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 3b.1 Mission

Relancer les prospects apres envoi du devis selon une sequence optimisee, detecter les signaux d'achat (ouvertures, visites pricing, forward a collegue), gerer les objections par email, et identifier les prospects fantomes pour breakup ou transfert vers nurturing.

## 3b.2 Architecture technique

```
Devis envoye (stage DEVIS_CREE)
    |
    v
+---------------------------------------------------+
| SOUS-AGENT 8b : RELANCEUR DE DEALS                |
| 1. Sequence de relance J3/J7/J14 + breakup        |
| 2. Detection signaux d'achat (score engagement)    |
| 3. Templates de relance par objection              |
| 4. Gestion prospects fantomes                      |
| 5. Escalade Jonathan si signal fort                 |
+---------------------------------------------------+
    |
    +---> [Prospect repond] --> Sous-agent 8c (Signature)
    +---> [Prospect fantome] --> Agent 6 (NURTUREUR)
    +---> [Signal fort] --> Notification Jonathan
```

## 3b.3 Sequence de relance post-devis

| Jour | Action | Canal | Template | Taux reponse attendu |
|------|--------|-------|---------|---------------------|
| J0 | Envoi devis | Email | Email d'accompagnement du devis | -- |
| J3 | Verification reception | Email | `followup_reception` | 31% |
| J7 | Traitement objection / angle valeur | Email | `followup_valeur` | 27% |
| J14 | Breakup email | Email | `followup_breakup` | 33% |
| J14 | Changement canal (si aucune reponse email) | LinkedIn | `linkedin_devis_followup` | 12% |
| J21 | LinkedIn case study | LinkedIn | `linkedin_case_study` | 10% |
| J30 | Dernier contact reconquete | Email | `reconquete_final` | 8% |
| J45 | Passage en PERDU | Systeme | -- | -- |

**Regles critiques :**
- Espacer les relances de minimum 3 jours (J+1 = -11% taux reponse)
- Maximum 4 emails avant de basculer vers LinkedIn
- Si engagement score >= 25, escalader immediatement a Jonathan pour appel
- Si aucune reponse apres le breakup email : attendre 7 jours puis LinkedIn
- Si aucune reponse J+45 : statut "PERDU", transfert Agent 6

## 3b.4 Code TypeScript complet

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { db, slack, emailService, linkedinService, dealmakerQueue } from './services'

// ============================================================
// INTERFACES
// ============================================================

interface FollowUpJob {
  type: 'FOLLOW_UP'
  deal_id: string
  prospect_id: string
  devis_id: string
  step: number            // 1=J3, 2=J7, 3=J14(breakup), 4=J14(LinkedIn), 5=J21, 6=J30
  tracking_id: string
}

interface EngagementScore {
  deal_id: string
  score: number
  signals: Array<{
    type: string
    points: number
    detected_at: string
  }>
  last_updated: string
}

interface BuySignal {
  type: 'devis_ouvert' | 'devis_multi_ouvert' | 'page_pricing' | 'reponse_question' |
        'linkedin_engagement' | 'forward_interne' | 'demande_info' | 'meeting_accepte'
  score_impact: number
  action: 'log_only' | 'alert_jonathan' | 'alert_jonathan_urgent' |
          'send_case_study' | 'fast_reply_required' | 'schedule_call'
}

// ============================================================
// SIGNAUX D'ACHAT + SCORING
// ============================================================

const BUY_SIGNALS: BuySignal[] = [
  { type: 'devis_ouvert',        score_impact: 1,  action: 'log_only' },
  { type: 'devis_multi_ouvert',  score_impact: 20, action: 'alert_jonathan' },       // 3+ ouvertures
  { type: 'page_pricing',        score_impact: 20, action: 'send_case_study' },
  { type: 'reponse_question',    score_impact: 25, action: 'fast_reply_required' },
  { type: 'linkedin_engagement', score_impact: 10, action: 'log_only' },
  { type: 'forward_interne',     score_impact: 15, action: 'alert_jonathan_urgent' }, // Prospect forwarde le devis
  { type: 'demande_info',        score_impact: 20, action: 'schedule_call' },
  { type: 'meeting_accepte',     score_impact: 50, action: 'alert_jonathan_urgent' },
]

// Seuils de decision
const SCORE_THRESHOLDS = {
  RELANCE_AGRESSIVE: 25,   // Score >= 25 : relancer immediatement + escalade Jonathan
  NURTURE: 10,              // Score 10-24 : envoyer du contenu education
  BREAKUP: 9,               // Score 0-9 : envoyer breakup email
  READY_TO_SIGN: 75,        // Score >= 75 : notification prioritaire "Ready to Sign"
}

async function updateEngagementScore(
  dealId: string,
  signalType: string,
  points: number
): Promise<EngagementScore> {
  const existing = await db.engagement_scores.findByDealId(dealId)

  const newSignal = {
    type: signalType,
    points,
    detected_at: new Date().toISOString(),
  }

  if (existing) {
    existing.score += points
    existing.signals.push(newSignal)
    existing.last_updated = new Date().toISOString()
    await db.engagement_scores.update(existing)

    // Verifier les seuils
    if (existing.score >= SCORE_THRESHOLDS.READY_TO_SIGN) {
      await notifyReadyToSign(dealId, existing)
    } else if (existing.score >= SCORE_THRESHOLDS.RELANCE_AGRESSIVE) {
      await triggerAggressiveFollowUp(dealId, existing)
    }

    return existing
  }

  const newScore: EngagementScore = {
    deal_id: dealId,
    score: points,
    signals: [newSignal],
    last_updated: new Date().toISOString(),
  }
  await db.engagement_scores.create(newScore)
  return newScore
}

async function notifyReadyToSign(dealId: string, score: EngagementScore): Promise<void> {
  const deal = await db.deals.findById(dealId)
  await slack.send('#deals', {
    text: `:fire: READY TO SIGN : ${deal.entreprise_nom} (score engagement: ${score.score}). Appeler MAINTENANT.`,
  })
}

async function triggerAggressiveFollowUp(dealId: string, score: EngagementScore): Promise<void> {
  const deal = await db.deals.findById(dealId)
  await slack.send('#deals', {
    text: `Signal d'achat fort pour ${deal.entreprise_nom} (score: ${score.score}). Envisager appel Jonathan.`,
  })
}

// ============================================================
// TEMPLATES DE RELANCE
// ============================================================

const FOLLOW_UP_TEMPLATES: Record<string, {
  subject: string
  body: string
  canal: 'email' | 'linkedin'
}> = {

  // --- J3 : VERIFICATION RECEPTION ---
  followup_reception: {
    subject: 'Re: Proposition Axiom - {{type_projet}} pour {{entreprise_nom}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

Je voulais m'assurer que vous avez bien recu notre proposition envoyee {{jour_envoi}}.

Si vous avez des questions sur le contenu ou souhaitez qu'on ajuste certains elements, n'hesitez pas.

Je suis disponible pour un appel rapide de 15 min si ca peut etre utile.

A bientot,
Jonathan`
  },

  // --- J7 : ANGLE VALEUR ---
  followup_valeur: {
    subject: 'Un point cle sur votre projet {{type_projet}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

En repensant a notre echange, un element me semble important a souligner : {{point_valeur_specifique}}.

Pour info, nous avons recemment accompagne {{entreprise_similaire}} sur un projet comparable, avec des resultats concrets en {{delai_resultats}}.

Si le budget est une consideration, sachez que nous proposons un echelonnement de paiement ({{echeancier}}) qui rend le projet plus accessible.

Dites-moi ce qui vous conviendrait pour avancer.

Jonathan`
  },

  // --- J14 : BREAKUP EMAIL ---
  followup_breakup: {
    subject: 'Juste une clarification, {{prenom}}',
    canal: 'email',
    body: `Bonjour {{prenom}},

Ca fait deux semaines et je n'ai pas eu de retour. C'est probablement un signe que :

- Le timing n'est pas le bon
- La proposition ne correspond pas exactement
- Vous avez d'autres priorites en ce moment

Je ne vais pas continuer a vous relancer inutilement.

Deux options simples :

A) On reprend contact en {{mois_relance}} quand ca sera plus pertinent
B) Je retire votre dossier de mes suivis

Pas de jugement. Juste de la clarte de part et d'autre.

Jonathan`
  },

  // --- J14 : LINKEDIN (CHANGEMENT CANAL) ---
  linkedin_devis_followup: {
    subject: '',
    canal: 'linkedin',
    body: `Bonjour {{prenom}}, je vous avais transmis une proposition pour votre projet {{type_projet}} il y a quelques jours. Je me permets de vous relancer ici au cas ou l'email serait passe inapercu. Dites-moi si vous avez des questions ou si on ajuste quelque chose.`
  },

  // --- J21 : LINKEDIN CASE STUDY ---
  linkedin_case_study: {
    subject: '',
    canal: 'linkedin',
    body: `Bonjour {{prenom}}, je pensais a vous en voyant les resultats de notre dernier projet {{type_projet}} pour {{entreprise_similaire}}. {{resultats_concrets}}. Si ca vous parle pour {{entreprise_nom}}, on peut en discuter rapidement.`
  },

  // --- J30 : RECONQUETE FINALE ---
  reconquete_final: {
    subject: 'Dernier point - {{entreprise_nom}} x Axiom',
    canal: 'email',
    body: `Bonjour {{prenom}},

Je reviens une derniere fois vers vous concernant votre projet {{type_projet}}.

Depuis notre dernier echange, nous avons lance 3 projets similaires et affine notre approche. Si le sujet reste pertinent pour {{entreprise_nom}}, je vous propose un nouveau point de 15 min pour actualiser notre proposition.

Voici mon lien Calendly pour choisir un creneau : {{calendly_url}}

Si le sujet n'est plus d'actualite, je comprends parfaitement.

Bonne continuation,
Jonathan`
  },
}

// ============================================================
// TEMPLATES DE REPONSE AUX OBJECTIONS
// ============================================================

const OBJECTION_TEMPLATES: Record<string, {
  subject: string
  body: string
}> = {

  // --- OBJECTION : PRIX TROP ELEVE ---
  prix_eleve: {
    subject: 'Re: {{subject_original}} - Flexibilite tarifaire',
    body: `Bonjour {{prenom}},

Je comprends que l'investissement puisse paraitre important. Quelques elements pour eclairer votre reflexion :

1. **Formule adaptee** : Nous avons aussi une formule "{{tier_inferieur}}" a {{prix_tier_inferieur}} EUR HT, qui couvre vos besoins essentiels.

2. **Echelonnement** : Nous proposons un paiement en {{nb_echeances}} fois ({{detail_echeances}}), ce qui revient a {{montant_mensuel}} EUR/mois.

3. **ROI mesurable** : Sur la base de projets similaires, le retour sur investissement se situe entre {{roi_mois_min}} et {{roi_mois_max}} mois.

Voulez-vous qu'on ajuste la proposition sur la formule {{tier_inferieur}} avec echelonnement ?

Jonathan`
  },

  // --- OBJECTION : PAS LE BON MOMENT ---
  timing: {
    subject: 'Re: {{subject_original}} - On planifie ?',
    body: `Bonjour {{prenom}},

Je comprends, le timing est important.

Deux questions rapides pour qu'on se retrouve au bon moment :

- Votre budget pour ce type de projet est-il prevu sur quel trimestre ?
- Y a-t-il un evenement / deadline qui rendrait le projet plus urgent (lancement produit, refonte obligatoire, etc.) ?

Si {{mois_suggestion}} est plus confortable, je vous propose de bloquer un creneau des maintenant : {{calendly_url}}

En attendant, "pas maintenant" ne signifie pas "jamais" -- et chaque mois sans {{benefice_principal}} represente un manque a gagner.

A bientot,
Jonathan`
  },

  // --- OBJECTION : CONCURRENCE EN LICE ---
  concurrence: {
    subject: 'Re: {{subject_original}} - Ce qui nous differencie',
    body: `Bonjour {{prenom}},

C'est une bonne demarche de comparer. Voici ce qui differencie Axiom :

1. **Qualite** : Nous ne sous-traitons rien. Tout est fait en interne par notre equipe senior.
2. **Inclusions** : Notre formule {{tier_recommande}} inclut deja {{inclusions_differenciantes}} (souvent en option ailleurs).
3. **Transparence** : Pas de frais caches. Le prix affiche est le prix final.
4. **Resultats** : {{reference_client}} a obtenu {{resultat_concret}} apres notre accompagnement.

Avez-vous clarifie ces points avec {{concurrent}} ?

Je suis disponible pour un comparatif point par point si ca peut aider.

Jonathan`
  },

  // --- OBJECTION : PAS DE BUDGET ---
  budget: {
    subject: 'Re: {{subject_original}} - Solutions budgetaires',
    body: `Bonjour {{prenom}},

Le budget est une contrainte reelle. Voici quelques pistes :

1. **Demarrer petit** : Notre formule {{tier_bronze}} a {{prix_bronze}} EUR couvre les fondamentaux. On peut monter en puissance ensuite.

2. **Echelonnement** : Jusqu'a {{nb_echeances}} mois de paiement sans frais.

3. **Phase 1 / Phase 2** : On decoupe le projet en phases. Phase 1 avec le budget disponible, Phase 2 quand le budget se libere.

4. **ROI rapide** : {{argument_roi}} peut financer la Phase 2.

Quel scenario correspondrait le mieux a votre situation ?

Jonathan`
  },

  // --- OBJECTION : INACTION / INDECISION ---
  inaction: {
    subject: 'On simplifie ? 2 options claires',
    body: `Bonjour {{prenom}},

J'ai l'impression qu'on s'est peut-etre complique les choses. Simplifions :

**OPTION A (rapide)** : Formule {{tier_bronze}} a {{prix_bronze}} EUR
{{resume_bronze}}
Livraison : {{timeline_bronze}} semaines

**OPTION B (complet)** : Formule {{tier_recommande}} a {{prix_recommande}} EUR
{{resume_recommande}}
Livraison : {{timeline_recommande}} semaines

Lequel resonne le plus ? Et quel serait le meilleur moment pour demarrer ?

Jonathan`
  },
}

// ============================================================
// CLASSE PRINCIPALE : RELANCEUR DE DEALS
// ============================================================

class SubAgent8b_RelanceurDeals {

  async processFollowUp(job: FollowUpJob): Promise<void> {
    const deal = await db.deals.findById(job.deal_id)
    if (!deal) {
      console.warn(`[Agent8b] Deal ${job.deal_id} non trouve`)
      return
    }

    // Verifier que le deal est toujours actif (pas deja signe ou perdu)
    if (['GAGNE', 'PERDU', 'SIGNATURE_EN_COURS'].includes(deal.stage)) {
      console.info(`[Agent8b] Deal ${job.deal_id} en stage ${deal.stage}, pas de relance`)
      return
    }

    // Verifier si le prospect a repondu entre-temps
    const recentReply = await db.replies.findRecent(job.prospect_id, 48) // 48h
    if (recentReply) {
      console.info(`[Agent8b] Prospect ${job.prospect_id} a repondu, annulation relance`)
      return
    }

    // Recuperer le score d'engagement
    const engagement = await db.engagement_scores.findByDealId(job.deal_id)
    const score = engagement?.score || 0

    // Router selon l'etape
    switch (job.step) {
      case 1: // J3 : verification reception
        await this.sendFollowUp(deal, 'followup_reception', job)
        await this.scheduleNext(job, 2, 4) // Prochaine relance dans 4 jours (J7)
        break

      case 2: // J7 : angle valeur
        await this.sendFollowUp(deal, 'followup_valeur', job)
        await this.scheduleNext(job, 3, 7) // Prochaine relance dans 7 jours (J14)
        break

      case 3: // J14 : breakup email
        if (score >= SCORE_THRESHOLDS.RELANCE_AGRESSIVE) {
          // Score eleve : ne pas envoyer de breakup, escalader a Jonathan
          await slack.send('#deals', {
            text: `Deal ${deal.entreprise_nom} : score engagement ${score}, pas de breakup. Appel Jonathan recommande.`,
          })
        } else {
          await this.sendFollowUp(deal, 'followup_breakup', job)
        }
        // Planifier aussi une relance LinkedIn le meme jour
        await this.scheduleNext(job, 4, 0) // LinkedIn immediatement
        break

      case 4: // J14 : LinkedIn (changement de canal)
        if (deal.prospect_linkedin_url) {
          await this.sendLinkedInMessage(deal, 'linkedin_devis_followup')
        }
        await this.scheduleNext(job, 5, 7) // J21
        break

      case 5: // J21 : LinkedIn case study
        if (deal.prospect_linkedin_url) {
          await this.sendLinkedInMessage(deal, 'linkedin_case_study')
        }
        await this.scheduleNext(job, 6, 9) // J30
        break

      case 6: // J30 : reconquete finale
        await this.sendFollowUp(deal, 'reconquete_final', job)
        // Planifier le passage en PERDU dans 15 jours (J45)
        await this.scheduleLostDeal(job, 15)
        break
    }

    // Logger la relance
    await db.deal_activities.create({
      deal_id: job.deal_id,
      type: 'FOLLOW_UP',
      step: job.step,
      engagement_score: score,
      created_at: new Date(),
    })
  }

  private async sendFollowUp(deal: any, templateKey: string, job: FollowUpJob): Promise<void> {
    const template = FOLLOW_UP_TEMPLATES[templateKey]
    if (!template || template.canal !== 'email') return

    // Personnaliser le template avec les variables du deal
    const variables = await this.buildTemplateVariables(deal)
    const subject = this.interpolate(template.subject, variables)
    const body = this.interpolate(template.body, variables)

    await emailService.send({
      from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
      to: `${deal.prospect_prenom} ${deal.prospect_nom} <${deal.prospect_email}>`,
      subject,
      text: body,
      headers: {
        'X-Axiom-Deal-ID': deal.deal_id,
        'X-Axiom-Follow-Up-Step': String(job.step),
      }
    })

    // Mettre a jour le nombre de relances
    await db.deals.update({
      deal_id: deal.deal_id,
      nb_relances: (deal.nb_relances || 0) + 1,
      derniere_relance_at: new Date(),
    })
  }

  private async sendLinkedInMessage(deal: any, templateKey: string): Promise<void> {
    const template = FOLLOW_UP_TEMPLATES[templateKey]
    if (!template) return

    const variables = await this.buildTemplateVariables(deal)
    const body = this.interpolate(template.body, variables)

    try {
      await linkedinService.sendMessage(deal.prospect_linkedin_url, body)
    } catch (error) {
      console.warn(`[Agent8b] Echec envoi LinkedIn pour ${deal.deal_id}:`, error)
    }
  }

  async handleObjection(deal: any, objectionType: string, prospectReply: string): Promise<void> {
    const template = OBJECTION_TEMPLATES[objectionType]
    if (!template) {
      console.warn(`[Agent8b] Template objection inconnu: ${objectionType}`)
      return
    }

    // Generer une reponse personnalisee via Claude API
    const variables = await this.buildTemplateVariables(deal)

    // Enrichir les variables avec le contexte de l'objection
    const enrichedVariables = await this.enrichObjectionVariables(deal, objectionType, prospectReply, variables)

    const subject = this.interpolate(template.subject, enrichedVariables)
    const body = this.interpolate(template.body, enrichedVariables)

    // Envoyer la reponse (apres validation Jonathan si deal > 15 000 EUR)
    if (deal.montant_estime > 15000) {
      // Soumettre a validation Jonathan
      await slack.send('#deals', {
        text: `Reponse objection "${objectionType}" pour ${deal.entreprise_nom} (${deal.montant_estime} EUR). Valider avant envoi.`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `*Objection :* ${objectionType}\n*Reponse prospect :* ${prospectReply}\n\n*Reponse proposee :*\n${body}` } },
          {
            type: 'actions',
            elements: [
              { type: 'button', text: { type: 'plain_text', text: 'Envoyer' }, action_id: 'approve_objection_reply', value: deal.deal_id, style: 'primary' },
              { type: 'button', text: { type: 'plain_text', text: 'Modifier' }, action_id: 'edit_objection_reply', value: deal.deal_id },
            ]
          }
        ]
      })
    } else {
      // Envoi automatique pour deals < 15 000 EUR
      await emailService.send({
        from: 'Jonathan Dewaele <jonathan@axiom-marketing.fr>',
        to: deal.prospect_email,
        subject,
        text: body,
      })
    }

    // Mettre a jour le stage du deal
    await db.deals.update({
      deal_id: deal.deal_id,
      stage: 'NEGOCIATION',
      derniere_objection: objectionType,
      derniere_objection_at: new Date(),
    })
  }

  private async enrichObjectionVariables(
    deal: any,
    objectionType: string,
    prospectReply: string,
    baseVariables: Record<string, string>
  ): Promise<Record<string, string>> {
    const template = SERVICE_TEMPLATES[deal.type_projet]
    if (!template) return baseVariables

    const enriched = { ...baseVariables }

    // Variables specifiques par type d'objection
    switch (objectionType) {
      case 'prix_eleve':
        const tierOrder: Array<'bronze' | 'silver' | 'gold'> = ['bronze', 'silver', 'gold']
        const currentTierIndex = tierOrder.indexOf(deal.tier_recommande)
        const lowerTier = currentTierIndex > 0 ? tierOrder[currentTierIndex - 1] : 'bronze'
        enriched.tier_inferieur = template[lowerTier].nom
        enriched.prix_tier_inferieur = String(template[lowerTier].prix_affiche)
        enriched.nb_echeances = deal.montant_estime >= 10000 ? '3' : '2'
        enriched.detail_echeances = deal.montant_estime >= 10000 ? '30/40/30' : '50/50'
        enriched.montant_mensuel = String(Math.round(template[deal.tier_recommande].prix_affiche / (deal.montant_estime >= 10000 ? 3 : 2)))
        enriched.roi_mois_min = '3'
        enriched.roi_mois_max = '6'
        break

      case 'timing':
        enriched.mois_suggestion = this.suggestMonth()
        enriched.benefice_principal = this.getBeneficePrincipal(deal.type_projet)
        break

      case 'concurrence':
        enriched.concurrent = deal.concurrent_mentionne || 'l\'autre prestataire'
        enriched.inclusions_differenciantes = this.getInclusions(deal.type_projet)
        enriched.reference_client = 'un client du meme secteur'
        enriched.resultat_concret = this.getResultatConcret(deal.type_projet)
        break

      case 'budget':
        enriched.tier_bronze = template.bronze.nom
        enriched.prix_bronze = String(template.bronze.prix_affiche)
        enriched.nb_echeances = '3'
        enriched.argument_roi = this.getROIArgument(deal.type_projet)
        break

      case 'inaction':
        enriched.tier_bronze = template.bronze.nom
        enriched.prix_bronze = String(template.bronze.prix_affiche)
        enriched.resume_bronze = template.bronze.features.slice(0, 3).join(', ')
        enriched.timeline_bronze = String(template.bronze.timeline_semaines)
        enriched.tier_recommande = template[deal.tier_recommande].nom
        enriched.prix_recommande = String(template[deal.tier_recommande].prix_affiche)
        enriched.resume_recommande = template[deal.tier_recommande].features.slice(0, 3).join(', ')
        enriched.timeline_recommande = String(template[deal.tier_recommande].timeline_semaines)
        break
    }

    return enriched
  }

  private async buildTemplateVariables(deal: any): Promise<Record<string, string>> {
    return {
      prenom: deal.prospect_prenom,
      nom: deal.prospect_nom,
      entreprise_nom: deal.entreprise_nom,
      type_projet: deal.type_projet || 'projet',
      subject_original: deal.dernier_subject || '',
      tier_recommande: deal.tier_recommande || 'silver',
      calendly_url: process.env.CALENDLY_URL || 'https://calendly.com/jonathan-axiom/30min',
      jour_envoi: new Date(deal.devis_envoye_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
      point_valeur_specifique: deal.rdv_notes?.points_sensibles || 'l\'optimisation de votre presence digitale',
      entreprise_similaire: 'une entreprise similaire de votre secteur',
      delai_resultats: '3 mois',
      echeancier: deal.montant_estime >= 10000 ? '30/40/30' : '50/50',
      mois_relance: this.suggestMonth(),
      resultats_concrets: 'un gain de 40% en performance',
    }
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `[${key}]`)
  }

  private async scheduleNext(job: FollowUpJob, nextStep: number, delayDays: number): Promise<void> {
    await dealmakerQueue.add(
      `followup-${job.deal_id}-step${nextStep}`,
      {
        ...job,
        step: nextStep,
      },
      {
        delay: delayDays * 24 * 60 * 60 * 1000,
        priority: 3,
      }
    )
  }

  private async scheduleLostDeal(job: FollowUpJob, delayDays: number): Promise<void> {
    await dealmakerQueue.add(
      `lost-${job.deal_id}`,
      {
        type: 'MARK_LOST',
        deal_id: job.deal_id,
        prospect_id: job.prospect_id,
        reason: 'INACTION',
      },
      {
        delay: delayDays * 24 * 60 * 60 * 1000,
        priority: 5,
      }
    )
  }

  private suggestMonth(): string {
    const now = new Date()
    const future = new Date(now.setMonth(now.getMonth() + 2))
    return future.toLocaleDateString('fr-FR', { month: 'long' })
  }

  private getBeneficePrincipal(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'un site web performant',
      ecommerce_shopify: 'une boutique en ligne qui genere des ventes',
      app_flutter: 'une application mobile pour vos utilisateurs',
      app_metier: 'un outil metier qui accelere vos processus',
      rgaa: 'la conformite accessibilite',
      tracking_server_side: 'un tracking fiable et RGPD',
    }
    return map[typeProjet] || 'une presence digitale optimisee'
  }

  private getInclusions(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'le SEO on-page, la formation et la configuration GA4',
      ecommerce_shopify: 'la configuration Klaviyo, les apps strategiques et le training',
      app_flutter: 'le design UX Figma, les tests et le support post-lancement',
      app_metier: 'l\'API documentee, les tests automatises et le support 4 mois',
      rgaa: 'les tests utilisateurs handicapes et le schema pluriannuel',
      tracking_server_side: 'le Consent Mode V2 et le monitoring',
    }
    return map[typeProjet] || 'la formation et le support'
  }

  private getResultatConcret(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: '+45% de trafic organique en 6 mois',
      ecommerce_shopify: '+60% de conversion en 3 mois',
      app_flutter: '4.7/5 sur les stores apres 2 mois',
      app_metier: '-30% de temps de traitement des dossiers',
      rgaa: 'score RGAA passe de 45% a 92%',
      tracking_server_side: '+41% de precision des donnees analytics',
    }
    return map[typeProjet] || 'des resultats mesurables rapidement'
  }

  private getROIArgument(typeProjet: string): string {
    const map: Record<string, string> = {
      site_vitrine: 'Le gain de leads via le nouveau site',
      ecommerce_shopify: 'Le chiffre d\'affaires genere par la boutique',
      app_flutter: 'La monetisation de l\'app',
      app_metier: 'Le gain de productivite mesurable',
      rgaa: 'L\'evitement des sanctions legales',
      tracking_server_side: 'L\'optimisation des depenses publicitaires',
    }
    return map[typeProjet] || 'Le retour sur investissement'
  }
}

// ============================================================
// GESTION DES DEALS PERDUS
// ============================================================

async function handleLostDeal(dealId: string, reason: string): Promise<void> {
  const deal = await db.deals.findById(dealId)

  // 1. Mettre a jour le stage
  await db.deals.update({
    deal_id: dealId,
    stage: 'PERDU',
    lost_reason: reason,
    lost_at: new Date(),
  })

  // 2. Transferer vers Agent 6 (NURTUREUR) pour re-nurture
  const lostDealHandoff: LostDealToNurturer = {
    prospect_id: deal.prospect_id,
    deal_id: dealId,
    reason: mapReason(reason),
    detail: deal.derniere_objection || 'Aucune reponse apres 45 jours',
    dernier_contact: deal.derniere_relance_at?.toISOString() || deal.devis_envoye_at.toISOString(),
    historique_touches: deal.nb_relances || 0,
    montant_estime: deal.montant_estime,
    recommendation: generateRecommendation(deal, reason),
    recontact_date: calculateRecontactDate(reason).toISOString(),
  }

  await nurturerQueue.add(
    `lost-deal-${deal.prospect_id}`,
    lostDealHandoff,
    { priority: 5 }
  )

  // 3. Envoyer metriques a l'Agent 7
  await analysteQueue.add('deal-metrics', {
    type: 'deal_lost',
    deal_id: dealId,
    montant: deal.montant_estime,
    reason,
    cycle_days: daysBetween(deal.created_at, new Date()),
    segment: deal.segment,
    nb_relances: deal.nb_relances || 0,
  })

  // 4. Notifier Jonathan
  await slack.send('#deals', {
    text: `Deal PERDU : ${deal.entreprise_nom} (${deal.montant_estime} EUR) - Raison : ${reason}. Transfere au NURTUREUR pour re-engagement dans ${calculateRecontactDate(reason).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`,
  })
}

function mapReason(reason: string): 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE' {
  const map: Record<string, 'PRIX' | 'TIMING' | 'CONCURRENCE' | 'INACTION' | 'AUTRE'> = {
    'prix_eleve': 'PRIX',
    'timing': 'TIMING',
    'concurrence': 'CONCURRENCE',
    'INACTION': 'INACTION',
    'budget': 'PRIX',
    'inaction': 'INACTION',
    'indecision': 'INACTION',
  }
  return map[reason] || 'AUTRE'
}

function calculateRecontactDate(reason: string): Date {
  const now = new Date()
  switch (reason) {
    case 'INACTION': return new Date(now.setMonth(now.getMonth() + 3))
    case 'prix_eleve':
    case 'budget': return new Date(now.setMonth(now.getMonth() + 3))
    case 'timing': return new Date(now.setMonth(now.getMonth() + 2))
    case 'concurrence': return new Date(now.setMonth(now.getMonth() + 6))
    default: return new Date(now.setMonth(now.getMonth() + 3))
  }
}

function generateRecommendation(deal: any, reason: string): string {
  const map: Record<string, string> = {
    'INACTION': `Recontacter dans 3 mois avec un case study ${deal.type_projet}. Proposer un audit gratuit comme point d'entree.`,
    'prix_eleve': `Recontacter dans 3 mois avec la formule ${deal.tier_recommande === 'gold' ? 'Silver' : 'Bronze'}. Mettre en avant le ROI.`,
    'timing': `Recontacter a la date indiquee par le prospect. Envoyer du contenu educatif mensuel en attendant.`,
    'concurrence': `Recontacter dans 6 mois pour voir si le prestataire concurrent donne satisfaction. Maintenir la relation LinkedIn.`,
    'budget': `Recontacter en debut de Q+1 quand les budgets sont realloues. Proposer un demarrage Phase 1 a budget reduit.`,
  }
  return map[reason] || `Recontacter dans 3 mois avec du contenu adapte au secteur ${deal.entreprise_secteur}.`
}

function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
```

---

**Fin du Sous-Agent 8b -- Relanceur de Deals**
