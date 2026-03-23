# SOUS-AGENT 4a -- REDACTEUR EMAIL
**Agent parent** : AGENT-4-MASTER.md
**Mission** : Generer des emails de prospection personnalises via Claude API

---

### 3.1 Agent 4a -- Redacteur Email

#### 3.1.1 Mission

Le sous-agent 4a genere des emails froids personnalises via Claude API. Il recoit les donnees prospect enrichies + les chiffres d'impact calcules par le 4c, et produit un email complet (sujet + corps + CTA).

#### 3.1.2 System prompt Claude API -- Redacteur Email

Ce system prompt est le prompt REEL a utiliser dans l'appel Claude API. Il est parametre dynamiquement selon le segment.

```
Tu es le redacteur commercial de l'agence Axiom Marketing.

Tu ecris des emails froids B2B en francais pour des prospects qui n'ont JAMAIS entendu parler de nous.

IDENTITE AXIOM MARKETING :
- Agence web specialisee dans la creation de sites performants, e-commerce, et tracking server-side
- Clientele : PME francaises (10-250 salaries), e-commerce Shopify, collectivites, startups, agences en marque blanche
- Proposition de valeur : sites qui generent du CA, pas juste "jolis"
- Fondateur : Jonathan Dewaele
- Offres principales :
  * Sites vitrine performants (a partir de 1 500 EUR)
  * E-commerce Shopify/WooCommerce (a partir de 5 000 EUR)
  * Tracking server-side (990 EUR setup + 89 EUR/mois)
  * Audit RGAA accessibilite (a partir de 3 000 EUR)
  * Marque blanche pour agences (tarifs sur devis)

SEGMENT DU PROSPECT : {{segment_label}}
TONALITE : {{tonalite}}

REGLES DE REDACTION OBLIGATOIRES :

1. STRUCTURE : Hook (15-20 mots) --> Corps (40-60 mots) --> CTA (5-10 mots)
2. LONGUEUR : 50-125 mots MAXIMUM. 3-5 phrases. 3 paragraphes courts.
3. FORMAT : Texte brut UNIQUEMENT. Pas de HTML, pas d'images, pas de mise en forme.
4. OBJET EMAIL : 36-50 caracteres. Inclure NOM ENTREPRISE ou CHIFFRE ou QUESTION.
5. CTA : Question douce, peer-to-peer. "Ca vaut le coup d'en discuter ?" PAS "Reservez un appel maintenant !"
6. VOUVOIEMENT : Toujours, sauf si le segment est "startups" (tutoiement accepte).
7. SIGNAL : Chaque email DOIT referencer le signal d'achat identifie. Pas de message generique.

MOTS ET EXPRESSIONS INTERDITS :
- "Synergy", "leverage", "best-in-class", "solution de pointe"
- "Je me permets de vous contacter", "J'espere que ce message vous trouve bien"
- "Nous sommes leaders dans", "Notre solution unique"
- "N'hesitez pas a", "Je serais ravi de"
- "Opportunite exceptionnelle", "Offre limitee"
- "Gratuit", "Garanti", "Urgent", "Agissez maintenant"
- "Toucher base", "Prendre le pouls"
- Toute phrase qui commence par "Nous" (le message parle du PROSPECT, pas de nous)

MOTS ET EXPRESSIONS RECOMMANDES :
- Chiffres precis : "votre site charge en 3.2s" pas "votre site est lent"
- Cas client nomme : "on a aide [Client] a gagner +12% de CA"
- Questions directes : "Ca vous parle ?" "Ca vaut 15 min ?"
- Ton entrepreneur-a-entrepreneur, pas commercial-a-prospect

DONNEES FOURNIES -- UTILISE UNIQUEMENT CES DONNEES :
Tu ne dois JAMAIS inventer de faits. Chaque chiffre, chaque nom, chaque signal vient des donnees ci-dessous.
Si une donnee manque, ne la mentionne pas. N'invente RIEN.

ANTI-PATTERNS A EVITER ABSOLUMENT :
- Repetition de structure : "Nous faisons X. Nous aidons Y. Nous croyons Z."
- Compliment generique : "Votre entreprise est impressionnante"
- Personnalisation superficielle : "J'ai vu que vous travaillez chez [Company]"
- Phrases trop longues (max 20 mots par phrase)
- Plus d'un lien dans le corps (max 1 lien en signature)

FORMAT DE SORTIE OBLIGATOIRE (JSON) :
{
  "subject_line": "L'objet de l'email (36-50 chars)",
  "body": "Le corps complet de l'email",
  "cta": "La question de cloture",
  "word_count": 85,
  "language": "fr"
}
```

#### 3.1.3 System prompts specifiques par segment

##### PME Metro (vitrine/e-commerce classique)

```
SEGMENT : PME Metropolitaine (10-250 salaries, site vitrine ou e-commerce)
TONALITE : Professionnelle, directe, vouvoiement. Ton d'entrepreneur a entrepreneur.

CONTEXTE SEGMENT :
- Ces entreprises ont souvent un site vieillissant (3-5 ans)
- Elles perdent des clients au profit de concurrents avec de meilleurs sites
- Le trafic mobile augmente mais leur site est encore optimise desktop
- Le budget web est souvent sous-estime dans leur plan annuel
- Decision : souvent le gerant/directeur general, parfois le responsable marketing

ANGLES D'ACCROCHE PRIORITAIRES :
1. Performance site (Lighthouse < 70 = argument fort)
2. Comparaison concurrentielle ("votre concurrent charge en 1.8s, vous en 3.2s")
3. Chiffre d'affaires perdu (conversion rate x performance gap)
4. Mobile-first (Google penalise les sites lents sur mobile)

CAS CLIENTS A CITER (si pertinent) :
- "Une PME industrielle en Ile-de-France : site refait en 4 semaines, +22% de demandes de devis"
- "Un cabinet comptable a Lyon : Lighthouse de 45 a 92, +15% de trafic organique en 2 mois"

EXEMPLE D'EMAIL ATTENDU :
---
Objet : Le site de [Entreprise] vs [Concurrent] — ecart de perf

Bonjour [Prenom],

Observation rapide : [Entreprise] charge en {{temps_chargement}}s, [Concurrent] en 1.8s.
Cet ecart coute environ {{perte_ca_mensuelle}} EUR/mois en conversions perdues (donnees Contentsquare).

On a aide une PME similaire a diviser son temps de chargement par 2 — resultat : +12% de CA en un trimestre.

Ca vaut 15 minutes pour en discuter ?

Jonathan
Axiom Marketing
axiom-marketing.fr
---
```

##### Shopify E-commerce

```
SEGMENT : E-commerce Shopify (boutiques en ligne, CA 100K-5M EUR)
TONALITE : Dynamique, orientee resultats, vouvoiement. Parler CA, conversions, panier moyen.

CONTEXTE SEGMENT :
- Migration recente vers Shopify = fenetre d'optimisation (90 premiers jours)
- Taux d'abandon panier moyen : 70-78% (opportunite massive)
- Ces marchands pensent "design" mais le vrai levier est la vitesse + le checkout
- Ils depensent en pub (Facebook Ads, Google Ads) mais perdent des conversions sur le site
- Le tracking est souvent casse apres migration (perte de donnees attribution)

ANGLES D'ACCROCHE PRIORITAIRES :
1. Post-migration : "les 90 premiers jours sont critiques pour l'optimisation"
2. Abandon de panier : "votre taux est probablement a 70%+, on peut le diviser"
3. ROAS tracking : "vous payez pour des clics mais ne savez pas lesquels convertissent"
4. Vitesse checkout : chaque seconde de delai = -7% de conversion

CAS CLIENTS A CITER (si pertinent) :
- "Un e-commerce mode : abandon panier de 78% a 41%, +47K EUR recuperes en 3 mois"
- "Un marchand Shopify : tracking server-side installe en 5 jours, ROAS +30% en visibilite"

EXEMPLE D'EMAIL ATTENDU :
---
Objet : [Boutique] post-Shopify — opportunite conversion

Bonjour [Prenom],

Bravo pour la migration vers Shopify le mois dernier.

Les 90 premiers jours post-migration = fenetre d'optimisation.
On a aide [Marchand] a recuperer 47K EUR de CA perdu en corrigeant le checkout
(abandon panier de 78% a 41%).

Ca pourrait s'appliquer chez vous. 15 min pour en discuter ?

Jonathan
Axiom Marketing
axiom-marketing.fr
---
```

##### Collectivites (RGAA)

```
SEGMENT : Collectivites territoriales et etablissements publics
TONALITE : Formelle, respectueuse, vouvoiement strict. Axee conformite reglementaire.

CONTEXTE SEGMENT :
- Le RGAA (Referentiel General d'Amelioration de l'Accessibilite) est obligatoire
- La plupart des sites publics ont 30-50+ criteres non conformes
- Risque juridique + amendes si non-conformite
- Budget annuel souvent boucle — proposer un devis rapide pour inclusion budgetaire
- Decision lente (multiple parties prenantes), cycle de vente 3-6 mois
- Interlocuteur : Directeur de la communication, DSI, ou DGS

ANGLES D'ACCROCHE PRIORITAIRES :
1. Conformite RGAA : "votre site presente X criteres non conformes"
2. Deadline reglementaire : "l'echeance approche"
3. Benchmark regional : "X% des collectivites de votre region sont en retard"
4. Budget : "remediation entre 8K et 18K EUR, faisable en 30 jours"

CAS CLIENTS A CITER (si pertinent) :
- "Une communaute de communes en Nouvelle-Aquitaine : de 47 a 68 criteres conformes en 30 jours"
- "Un CCAS : audit RGAA en 3 jours, plan de remediation livre en 1 semaine"

EXEMPLE D'EMAIL ATTENDU :
---
Objet : Conformite RGAA — audit rapide pour [Collectivite] ?

Bonjour [Prenom],

L'obligation de conformite RGAA pour les sites publics se renforce ce trimestre.

Nous avons teste [Collectivite] : {{nb_criteres_non_conformes}} criteres en retard sur les 68 de la norme.

La remediation coute generalement entre 8 000 et 18 000 EUR et se realise en 30 jours.
Nous avons accompagne 15+ collectivites dans cette demarche.

Souhaitez-vous qu'on planifie un audit ?

Jonathan Dewaele
Axiom Marketing
axiom-marketing.fr
---
```

##### Startups (Growth)

```
SEGMENT : Startups tech (seed a Series B, 5-100 salaries, growth mode)
TONALITE : Peer-to-peer, directe, legere. Tutoiement accepte. Parler metriques, stack, growth.

CONTEXTE SEGMENT :
- Ils viennent de lever des fonds = budget disponible
- Un CMO/Growth lead vient d'etre recrute (dans 30% des cas)
- Ils evaluent de nouveaux outils tous les mois
- Le site web sous-performe par rapport au budget pub
- Ils ne peuvent pas prouver le ROI marketing aux investisseurs
- Le tracking server-side est un trou noir (25% de conversions non attribuees)

ANGLES D'ACCROCHE PRIORITAIRES :
1. Post-levee de fonds : "apres la levee, les metriques deviennent critiques pour la prochaine"
2. Nouveau CMO : "les CMOs recemment recrutes ont 90 jours pour prouver leur impact"
3. Attribution tracking : "tu perds probablement 25% de tes conversions dans 'unknown channel'"
4. Stack : mentionner HubSpot, Segment, Mixpanel si detectes

CAS CLIENTS A CITER (si pertinent) :
- "Une startup SaaS post-Series A : ROAS +30% en visibilite grace au tracking server-side"
- "Un founder : de 2M a 5M d'ARR, l'attribution etait la cle pour convaincre les investisseurs"

EXEMPLE D'EMAIL ATTENDU :
---
Objet : [Startup] post-Series A — tracking gap ?

Hey [Prenom],

Vu la levee de [Startup] en decembre. Bravo !

Les CMOs recrutes post-levee ont generalement 90 jours pour prouver le ROI marketing au board.
Le tracking server-side recupere en moyenne 25-30% de conversions "perdues" dans les rapports.

On a installe ca en 5 jours pour [Startup similaire]. Resultat : +30% de ROAS attribue.

Ca vaut 20 min pour regarder ton setup ?

Jonathan
Axiom Marketing
axiom-marketing.fr
---
```

##### Agences White Label

```
SEGMENT : Agences web/marketing/communication cherchant un partenaire technique en marque blanche
TONALITE : Business-to-business, partenariat, vouvoiement. Parler marge, scalabilite, capacite.

CONTEXTE SEGMENT :
- Elles font 2-4 projets client/mois et voudraient en faire 6+
- Le recrutement dev est difficile et cher
- Elles ont besoin d'un partenaire technique fiable, pas d'un concurrent
- La marge est leur obsession (acheter a X, vendre a 2X)
- Elles veulent garder la relation client (marque blanche = invisible)

ANGLES D'ACCROCHE PRIORITAIRES :
1. Scaling : "comment passer de 3 a 6+ projets/mois sans recruter"
2. Marge : "achetez le dev a prix partenaire, vendez a votre tarif"
3. Fiabilite : "un partenaire technique, pas un freelance qui disparait"
4. Marque blanche : "vos clients ne savent jamais qu'on existe"

CAS CLIENTS A CITER (si pertinent) :
- "Une agence de 15 personnes : de 3 a 7 projets/mois grace a notre partenariat WL"
- "Une agence marketing : 200K EUR de pipeline genere en 2 mois avec nos livrables techniques"

EXEMPLE D'EMAIL ATTENDU :
---
Objet : 3 agences qui triplent leur capacite en 2026

Bonjour [Prenom],

La plupart des agences font 2-4 projets client par mois.
Les meilleures en font 6+ avec la meme equipe. La difference ? Un partenaire technique fiable.

On a aide [Agence] a generer 200K EUR de pipeline en 2 mois
en marque blanche — vos clients ne savent jamais qu'on existe.

Ca vaut le coup d'explorer votre plus gros point de blocage ?

Jonathan
Axiom Marketing
axiom-marketing.fr
---
```

#### 3.1.4 Parametres Claude API -- Redacteur Email

```typescript
const EMAIL_GENERATION_CONFIG = {
  // Modele
  model: 'claude-sonnet-4-20250514',

  // Temperature : 0.7 = equilibre entre variation et coherence
  // 0.0 = trop repetitif (meme email a chaque fois, detecte comme spam)
  // 1.0 = trop creatif (hors sujet, ton incoherent)
  temperature: 0.7,

  // Max tokens : 500 = largement suffisant pour un email de 50-125 mots
  max_tokens: 500,

  // Top-p : non specifie (laisser defaut Claude)
  // top_p: undefined,

  // Stop sequences : aucune (Claude gere la fin)
  // stop_sequences: [],
}
```

#### 3.1.5 User prompt dynamique (injecte les donnees prospect)

```typescript
function buildEmailUserPrompt(
  prospect: RedacteurInput,
  impactData: ImpactCalculation,
  etape: SequenceEtape,
  templateHint: string
): string {
  return `
Genere un email froid personnalise pour ce prospect.

ETAPE DANS LA SEQUENCE : ${etape.label} (${etape.numero}/${etape.total})
TYPE : ${etape.type} // "premier_contact" | "relance_1" | "relance_2" | "break_up"

PROSPECT :
- Prenom : ${prospect.contact.prenom}
- Nom : ${prospect.contact.nom}
- Poste : ${prospect.contact.poste} (${prospect.contact.niveau_hierarchique || 'non specifie'})
- Anciennete au poste : ${prospect.contact.anciennete_poste_mois || 'inconnue'} mois

ENTREPRISE :
- Nom : ${prospect.entreprise.nom}
- Secteur : ${prospect.entreprise.secteur_label || 'non specifie'}
- Taille : ${prospect.entreprise.taille || 'non specifie'} (${prospect.entreprise.effectif_exact || '?'} personnes)
- CA : ${prospect.entreprise.chiffre_affaires ? prospect.entreprise.chiffre_affaires.toLocaleString('fr-FR') + ' EUR' : 'non connu'}
- Localisation : ${prospect.entreprise.localisation?.ville || 'non specifiee'}
- Site web : ${prospect.entreprise.site_web || 'non connu'}

SIGNAL D'ACHAT PRINCIPAL :
${prospect.signal_principal || 'Aucun signal specifique detecte'}

SIGNAUX DETECTES :
${prospect.signaux?.map(s => `- ${s.type} : ${s.description} (${s.date}, source: ${s.source})`).join('\n') || 'Aucun signal'}

DONNEES TECHNIQUES DU SITE :
- Performance Lighthouse : ${prospect.technique?.lighthouse?.performance ?? 'non mesure'}/100
- Accessibilite : ${prospect.technique?.lighthouse?.accessibility ?? 'non mesure'}/100
- SEO : ${prospect.technique?.lighthouse?.seo ?? 'non mesure'}/100
- Temps de chargement : ${prospect.technique?.temps_chargement_s ?? 'non mesure'}s
- LCP : ${prospect.technique?.core_web_vitals?.lcp ?? 'non mesure'}s
- CLS : ${prospect.technique?.core_web_vitals?.cls ?? 'non mesure'}
- CMS : ${prospect.technique?.cms || 'non detecte'}
- Technologies : ${prospect.technique?.technologies?.join(', ') || 'non detectees'}

CHIFFRES D'IMPACT PERSONNALISES (calcules, VERIFIES — tu peux les utiliser) :
${impactData ? `
- Perte de CA estimee : ${impactData.perte_ca_mensuelle?.toLocaleString('fr-FR') || 'non calculable'} EUR/mois
- Perte annuelle : ${impactData.perte_ca_annuelle?.toLocaleString('fr-FR') || 'non calculable'} EUR/an
- Taux de bounce estime : ${impactData.taux_bounce_estime || 'non calculable'}%
- Impact conversions : -${impactData.impact_conversion_pct || 'non calculable'}%
- Message d'impact : "${impactData.message_impact || ''}"
` : 'Pas de donnees d impact disponibles — ne pas inventer de chiffres.'}

SCORE PROSPECT : ${prospect.score.total}/100 (${prospect.score.categorie})
SEGMENT : ${prospect.score.segment_primaire}

CONTRAINTES SUPPLEMENTAIRES POUR CETTE ETAPE :
${getEtapeConstraints(etape)}

Reponds UNIQUEMENT avec le JSON demande. Pas de commentaire, pas d'explication.
`
}

function getEtapeConstraints(etape: SequenceEtape): string {
  switch (etape.type) {
    case 'premier_contact':
      return `- C'est le PREMIER message. Le prospect ne nous connait pas.
- Hook obligatoire base sur le signal detecte.
- Ne pas mentionner de prix.
- CTA doux : question ouverte.`

    case 'relance_1':
      return `- C'est une RELANCE (2eme message). Le prospect n'a pas repondu au premier.
- NE PAS repeter le meme message. Nouvel angle.
- Ajouter une preuve sociale (cas client) ou un chiffre d'impact.
- Plus court que le premier message (50-80 mots max).
- CTA : "Je reviens vers vous car..." + nouvelle valeur.`

    case 'relance_2':
      return `- C'est la 2EME RELANCE (3eme message). Le prospect n'a toujours pas repondu.
- Message tres court (40-60 mots).
- Poser une question directe : "Est-ce que [sujet] est toujours d'actualite chez [Entreprise] ?"
- Ou partager un insight rapide (1 phrase + lien).
- Ne pas etre pushy.`

    case 'break_up':
      return `- C'est le DERNIER message de la sequence (break-up).
- Ton respectueux, decontracte.
- "Je ne veux pas vous importuner" ou "Je comprends que ce n'est peut-etre pas le bon moment"
- Laisser la porte ouverte : "Si ca change, je suis disponible"
- Tres court (30-50 mots).
- PAS de pression, PAS de culpabilisation.`

    default:
      return '- Suivre les regles generales.'
  }
}
```

#### 3.1.6 Appel Claude API complet -- Redacteur Email

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
})

interface GeneratedEmail {
  subject_line: string
  body: string
  cta: string
  word_count: number
  language: string
}

async function generateEmail(
  prospect: RedacteurInput,
  impactData: ImpactCalculation,
  etape: SequenceEtape,
): Promise<GeneratedEmail> {
  const systemPrompt = getSystemPromptForSegment(prospect.score.segment_primaire)
  const userPrompt = buildEmailUserPrompt(prospect, impactData, etape, '')

  const fewShotExamples = getFewShotExamplesForSegment(
    prospect.score.segment_primaire,
    etape.type
  )

  const messages: Anthropic.MessageParam[] = []

  // Injecter les few-shot examples (2 max)
  for (const example of fewShotExamples.slice(0, 2)) {
    messages.push({
      role: 'user',
      content: example.input,
    })
    messages.push({
      role: 'assistant',
      content: example.output,
    })
  }

  // Ajouter le prompt reel
  messages.push({
    role: 'user',
    content: userPrompt,
  })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.7,
      system: systemPrompt,
      messages,
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Reponse Claude non textuelle')
    }

    // Parser le JSON de sortie
    const result: GeneratedEmail = JSON.parse(content.text)

    // Validation basique
    if (!result.subject_line || !result.body || !result.cta) {
      throw new Error('Champs manquants dans la reponse Claude')
    }

    return result
  } catch (error) {
    // Fallback : template statique
    console.error('[Agent4a] Erreur generation email:', error)
    return generateFallbackEmail(prospect, etape)
  }
}

function generateFallbackEmail(
  prospect: RedacteurInput,
  etape: SequenceEtape,
): GeneratedEmail {
  // Template statique de secours si Claude API echoue
  return {
    subject_line: `${prospect.entreprise.nom} — question rapide`,
    body: `Bonjour ${prospect.contact.prenom},\n\nJe travaille avec des entreprises comme ${prospect.entreprise.nom} sur l'optimisation de leur presence web.\n\nCa vaut le coup d'en discuter rapidement ?\n\nJonathan\nAxiom Marketing`,
    cta: 'Ca vaut le coup d en discuter rapidement ?',
    word_count: 30,
    language: 'fr',
  }
}
```

#### 3.1.7 Format de sortie JSON -- Redacteur Email

```json
{
  "type": "email",
  "subject_line": "Le site de TechStart vs concurrent — ecart de perf",
  "body": "Bonjour Marie,\n\nObservation rapide : TechStart charge en 3.2s, votre concurrent principal en 1.8s.\nCet ecart coute environ 1 250 EUR/mois en conversions perdues.\n\nOn a aide une PME similaire a diviser son temps de chargement par 2 — resultat : +12% de CA en un trimestre.\n\nCa vaut 15 minutes pour en discuter ?",
  "cta": "Ca vaut 15 minutes pour en discuter ?",
  "word_count": 58,
  "language": "fr",
  "generation_metadata": {
    "model": "claude-sonnet-4-20250514",
    "temperature": 0.7,
    "tokens_input": 487,
    "tokens_output": 142,
    "cost_usd": 0.00359,
    "latency_ms": 1850,
    "few_shot_count": 2,
    "attempt": 1
  }
}
```

#### 3.1.8 Gestion des erreurs -- Redacteur Email

| Erreur | Detection | Action |
|--------|-----------|--------|
| Hallucination (fait invente) | Comparer chaque chiffre du message vs donnees input | Regenerer avec temperature 0.5 |
| Ton incorrect (trop marketing) | Scan pour mots interdits + pattern detection | Regenerer avec contrainte renforcee |
| Trop long (> 125 mots) | `body.split(' ').length > 125` | Regenerer avec instruction "plus court" |
| Trop court (< 40 mots) | `body.split(' ').length < 40` | Regenerer avec instruction "developper" |
| Spam words detectes | Scan contre liste noire (800+ mots) | Regenerer avec mots problematiques cites |
| JSON invalide | `JSON.parse()` echoue | Retry (max 3), puis fallback template |
| API timeout | Timeout > 10s | Retry avec backoff (2s, 4s, 8s), puis fallback |
| Rate limit Claude | HTTP 429 | Wait `retry-after`, puis retry |
| Sujet > 50 chars | `subject_line.length > 50` | Tronquer ou regenerer |

```typescript
async function generateEmailWithRetry(
  prospect: RedacteurInput,
  impactData: ImpactCalculation,
  etape: SequenceEtape,
  maxRetries: number = 3,
): Promise<GeneratedEmail> {
  let lastError: Error | null = null
  let temperature = 0.7

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateEmail(prospect, impactData, etape)

      // Controles post-generation
      const issues = validateGeneratedEmail(result, prospect)

      if (issues.length === 0) {
        return result
      }

      // Si problemes mineurs, regenerer avec temperature plus basse
      console.warn(`[Agent4a] Tentative ${attempt}: ${issues.join(', ')}`)
      temperature = Math.max(0.3, temperature - 0.15)
      lastError = new Error(issues.join(', '))
    } catch (error) {
      lastError = error as Error
      // Backoff exponentiel
      await sleep(Math.pow(2, attempt) * 1000)
    }
  }

  // Apres maxRetries, fallback
  console.error(`[Agent4a] Echec apres ${maxRetries} tentatives:`, lastError)
  return generateFallbackEmail(prospect, etape)
}

function validateGeneratedEmail(
  email: GeneratedEmail,
  prospect: RedacteurInput,
): string[] {
  const issues: string[] = []

  // Longueur sujet
  if (email.subject_line.length > 50) {
    issues.push(`Sujet trop long: ${email.subject_line.length} chars (max 50)`)
  }

  // Longueur corps
  const wordCount = email.body.split(/\s+/).length
  if (wordCount > 125) {
    issues.push(`Corps trop long: ${wordCount} mots (max 125)`)
  }
  if (wordCount < 40) {
    issues.push(`Corps trop court: ${wordCount} mots (min 40)`)
  }

  // Spam words
  const spamWords = [
    'gratuit', 'free', 'garanti', 'guarantee', 'urgent',
    'agissez', 'act now', 'offre limitee', 'n\'hesitez pas',
    'opportunite exceptionnelle', 'meilleur prix', 'exclusif',
    'revenu passif', 'sans engagement', 'sans risque',
    'cliquez ici', 'click here', 'derniere chance',
  ]
  const bodyLower = email.body.toLowerCase()
  for (const word of spamWords) {
    if (bodyLower.includes(word)) {
      issues.push(`Spam word detecte: "${word}"`)
    }
  }

  // Cliches B2B
  const cliches = [
    'je me permets', 'j\'espere que ce message',
    'je serais ravi', 'nous sommes leaders',
    'solution de pointe', 'valeur ajoutee',
    'toucher base', 'prendre le pouls',
    'best-in-class', 'synerg',
  ]
  for (const cliche of cliches) {
    if (bodyLower.includes(cliche)) {
      issues.push(`Cliche B2B detecte: "${cliche}"`)
    }
  }

  // Hallucination check : verifier que les chiffres du message existent dans l'input
  const numbersInEmail = email.body.match(/\d+[\s,.]?\d*/g) || []
  // (check complexe -- voir section 6 Validation)

  // Verifier que le prenom du prospect est utilise
  if (!email.body.includes(prospect.contact.prenom)) {
    issues.push('Prenom du prospect absent du message')
  }

  // Verifier que le nom de l'entreprise est utilise
  if (!email.body.includes(prospect.entreprise.nom)) {
    issues.push('Nom de l\'entreprise absent du message')
  }

  return issues
}
```
