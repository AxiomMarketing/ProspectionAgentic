# SOUS-AGENT 10e — GESTIONNAIRE REFERRAL
**Agent parent** : AGENT-10-MASTER.md

**Version :** 1.0
**Date :** 2026-03-19

---

## 1. MISSION

Le Gestionnaire Referral opere le programme ambassadeur d'Axiom : identification des promoteurs, invitation au programme, tracking des referrals, gestion des commissions, et integration avec l'Agent 1 (VEILLEUR) pour les leads referral.

---

## 2. PROGRAMME AMBASSADEUR -- STRUCTURE COMMISSION

**Modele hybride recommande :**

| Tier (ACV referral) | Commission initiale | Bonus retention | Total possible |
|---|---|---|---|
| ACV < 15 000 EUR | 20% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~30% ACV |
| ACV 15 000 - 40 000 EUR | 15% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~25% ACV |
| ACV > 40 000 EUR | 10% du contrat initial | +5% mensuel x 12 mois si client retenu | Jusqu'a ~20% ACV |

**Exemple concret :**
```
Referrer recommande un client pour un e-commerce a 12 000 EUR :
- Commission initiale : 20% x 12 000 EUR = 2 400 EUR
- Si client retenu 12 mois et prend du tracking (89 EUR/mois) :
  Bonus : 5% x 89 EUR x 12 = 53,40 EUR
- Total referrer : 2 453,40 EUR

ROI pour Axiom :
- CAC normal nouveau client : ~4 500 EUR (30% du contrat)
- CAC via referral : 2 453 EUR
- Economie : 2 047 EUR + conversion 10x plus rapide
```

---

## 3. TAUX CONVERSION REFERRAL VS COLD

| Source | Taux conversion | Cout relatif | Cycle de vente |
|---|---|---|---|
| **Referral** | 30-40% | Tres bas | 15 jours |
| Cold email | 1-3% | Bas | 30+ jours |
| Cold call | 1-15% | Bas | 10-30 jours |
| Inbound (Google) | 15-25% | Moyen | 10 jours |
| Paid Ads | 2-5% | Eleve | 5 jours |

**Insight :** Referral = 10x meilleur taux de conversion que cold, a un cout 2x moindre.

---

## 4. CODE TYPESCRIPT

```typescript
// ============================================================
// GESTIONNAIRE REFERRAL
// ============================================================

interface ReferralProgram {
  ambassador_id: string
  client_id: string
  deal_id: string
  status: 'invited' | 'active' | 'referred' | 'converted' | 'paid'
  referral_code: string
  commission_tier: 'tier_1' | 'tier_2' | 'tier_3'
  referrals: ReferralLead[]
  total_commission_earned: number
  joined_at: string
}

interface ReferralLead {
  referral_id: string
  referred_by: string              // ambassador client_id
  referral_code: string
  lead: {
    prenom: string
    nom: string
    email: string
    entreprise: string
    besoin: string
  }
  status: 'submitted' | 'contacted' | 'qualified' | 'won' | 'lost'
  submitted_at: string
  converted_at?: string
  deal_value?: number
  commission_amount?: number
  commission_paid?: boolean
}

// ============================================================
// IDENTIFICATION AMBASSADEURS
// ============================================================

async function identifyAmbassadorCandidates(): Promise<string[]> {
  // Criteres : NPS >= 9, Health Score >= 80, client depuis 60+ jours
  const clients = await db.getClientsWhere({
    last_nps_score: { $gte: 9 },
    health_score: { $gte: 80 },
    client_since_days: { $gte: 60 },
    referral_program_status: { $ne: 'active' },
  })

  return clients.map((c: any) => c.client_id)
}

// ============================================================
// INVITATION AU PROGRAMME
// ============================================================

async function inviteToReferralProgram(clientId: string): Promise<void> {
  const client = await db.getClient(clientId)
  const deal = await db.getLatestDeal(clientId)

  // Generer code referral unique
  const referralCode = `AXIOM-${client.nom.toUpperCase().slice(0, 4)}-${
    Math.random().toString(36).substring(2, 6).toUpperCase()
  }`

  // Determiner le tier de commission
  const commissionTier = deal.contrat.montant_ht >= 40000
    ? 'tier_3'
    : deal.contrat.montant_ht >= 15000
    ? 'tier_2'
    : 'tier_1'

  // Sauvegarder le programme
  const program: ReferralProgram = {
    ambassador_id: `amb_${clientId}`,
    client_id: clientId,
    deal_id: deal.deal_id,
    status: 'invited',
    referral_code: referralCode,
    commission_tier: commissionTier,
    referrals: [],
    total_commission_earned: 0,
    joined_at: new Date().toISOString(),
  }
  await db.saveReferralProgram(program)

  // Envoyer email invitation
  await emailService.send({
    to: client.email,
    subject: `${client.prenom}, rejoignez le programme VIP Axiom`,
    template: 'referral_invitation',
    data: {
      prenom: client.prenom,
      referral_code: referralCode,
      referral_link: `https://axiom-marketing.fr/referral/${referralCode}`,
      commission_pct: commissionTier === 'tier_1' ? '20%' : commissionTier === 'tier_2' ? '15%' : '10%',
    },
  })

  // Programmer sequence de relance
  await referralSequenceQueue.add(`referral-seq-${clientId}`, {
    client_id: clientId,
    referral_code: referralCode,
  }, { delay: 7 * 24 * 60 * 60 * 1000 }) // Rappel J+7
}

// ============================================================
// TRAITEMENT REFERRAL RECU
// ============================================================

async function processIncomingReferral(
  referralCode: string,
  leadData: ReferralLead['lead']
): Promise<void> {
  // 1. Trouver l'ambassadeur
  const program = await db.getReferralProgramByCode(referralCode)
  if (!program) {
    throw new Error(`Code referral invalide: ${referralCode}`)
  }

  // 2. Creer le lead referral
  const referralId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const referral: ReferralLead = {
    referral_id: referralId,
    referred_by: program.client_id,
    referral_code: referralCode,
    lead: leadData,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }

  // 3. Sauvegarder le referral
  await db.addReferralToProgram(program.ambassador_id, referral)

  // 4. INTEGRATION AGENT 1 (VEILLEUR) -- Envoyer le lead referral
  const referralToVeilleur: ReferralToAgent1 = {
    type: 'referral_lead',
    referral_id: referralId,
    referred_by: {
      client_id: program.client_id,
      referral_code: referralCode,
    },
    lead: {
      prenom: leadData.prenom,
      nom: leadData.nom,
      email: leadData.email,
      entreprise: leadData.entreprise,
      besoin: leadData.besoin,
      source: 'referral',
    },
    priority_boost: 40,              // +40% lead score pour les referrals
    metadata: {
      agent: 'agent_10_csm',
      created_at: new Date().toISOString(),
      version: '1.0',
    },
  }

  // Envoyer a la queue du Veilleur
  await veilleurQueue.add(`referral-lead-${referralId}`, referralToVeilleur, {
    priority: 1, // Priorite maximale
  })

  // 5. Notifier l'ambassadeur
  const ambassador = await db.getClient(program.client_id)
  await emailService.send({
    to: ambassador.email,
    subject: `Merci ! Votre referral a ete recu`,
    template: 'referral_received_confirmation',
    data: {
      prenom: ambassador.prenom,
      lead_name: `${leadData.prenom} ${leadData.nom}`,
      lead_company: leadData.entreprise,
    },
  })

  // 6. Slack notification
  await slack.send('#csm-referrals', {
    text: `Nouveau referral recu !\n` +
      `Ambassadeur: ${ambassador.prenom} ${ambassador.nom}\n` +
      `Lead: ${leadData.prenom} ${leadData.nom} (${leadData.entreprise})\n` +
      `Besoin: ${leadData.besoin}`,
  })
}

// ============================================================
// GESTION COMMISSION POST-CONVERSION
// ============================================================

async function processReferralConversion(
  referralId: string,
  dealValue: number
): Promise<void> {
  const referral = await db.getReferral(referralId)
  const program = await db.getReferralProgramByCode(referral.referral_code)

  // Calculer la commission
  const commissionRates: Record<string, number> = {
    tier_1: 0.20,
    tier_2: 0.15,
    tier_3: 0.10,
  }
  const rate = commissionRates[program.commission_tier]
  const commissionAmount = dealValue * rate

  // Mettre a jour le referral
  await db.updateReferral(referralId, {
    status: 'won',
    converted_at: new Date().toISOString(),
    deal_value: dealValue,
    commission_amount: commissionAmount,
    commission_paid: false,
  })

  // Mettre a jour le programme
  await db.updateReferralProgram(program.ambassador_id, {
    total_commission_earned: program.total_commission_earned + commissionAmount,
  })

  // Notifier l'ambassadeur
  const ambassador = await db.getClient(program.client_id)
  await emailService.send({
    to: ambassador.email,
    subject: `Bravo ! Votre referral s'est converti - ${commissionAmount.toFixed(0)} EUR de commission`,
    template: 'referral_conversion_notification',
    data: {
      prenom: ambassador.prenom,
      lead_name: `${referral.lead.prenom} ${referral.lead.nom}`,
      deal_value: dealValue,
      commission_amount: commissionAmount,
      commission_rate: `${rate * 100}%`,
      total_earned: program.total_commission_earned + commissionAmount,
    },
  })

  // Slack celebration
  await slack.send('#csm-wins', {
    text: `Referral converti ! ${ambassador.prenom} ${ambassador.nom} gagne ` +
      `${commissionAmount.toFixed(0)} EUR de commission. Deal: ${dealValue} EUR.`,
  })
}
```

---

## 5. SEQUENCES EMAIL REFERRAL -- 3 TEMPLATES

### Template Referral 1 : Invitation programme VIP

```
Objet : {{prenom}}, rejoignez le programme VIP Axiom

Bonjour {{prenom}},

Votre retour recent (NPS: {{nps_score}}/10) nous montre que
vous appreciez travailler avec Axiom. Ca represente beaucoup pour nous !

Nous avons cree un Programme VIP Referral pour les clients
comme vous qui souhaitent aider d'autres entreprises a beneficier
d'un developpement web de qualite.

COMMENT CA FONCTIONNE :

--> Recommandez quelqu'un et gagnez {{commission_pct}}% de commission
    (ou credits service equivalents)
--> Votre contact beneficie d'un accompagnement prioritaire
--> Tout le monde y gagne

VOTRE LIEN UNIQUE : {{lien_referral}}
VOTRE CODE : {{code_referral}}

Pret a demarrer ? Cliquez ici : {{lien_referral}}

{{signature_axiom}}
```

### Template Referral 2 : Social proof (J+7)

```
Objet : Un de vos pairs a deja gagne {{montant_exemple}} EUR...

Bonjour {{prenom}},

Mise a jour rapide : {{nb_referrers_actifs}} de vos pairs dans
le programme ont deja recommande des clients et gagne des commissions.

L'un d'eux a genere {{montant_exemple}} EUR en un trimestre,
simplement en partageant son experience Axiom.

Voici le temoignage de {{nom_referrer_exemple}} :
"{{temoignage}}"

Toujours interesse ? {{lien_referral}}

{{signature_axiom}}
```

### Template Referral 3 : Rappel benefices (J+14)

```
Objet : Vous connaissez quelqu'un qui a besoin d'un site web ?

Bonjour {{prenom}},

Chaque recommandation n'est pas un travail. Si vous connaissez
quelqu'un qui a besoin d'un site web, d'une app ou d'un e-commerce,
passez-nous le contact. On s'occupe du reste.

EN RETOUR :
- {{commission_pct}}% de commission sur le contrat signe
- Credits service pour votre prochain projet
- Badge VIP sur notre page temoignages

Deja recommande quelqu'un cette annee ?
{{lien_referral}}

{{signature_axiom}}
```
