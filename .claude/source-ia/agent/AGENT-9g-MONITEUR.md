# SOUS-AGENT 9g — MONITEUR POST-DEPOT
**Agent parent** : AGENT-9-MASTER.md

---


---
---


## 3.7 SOUS-AGENT 9g -- MONITEUR POST-DEPOT

## Origine

**100% Jonathan Agent #9 "Tender Monitor"** -- Repris integralement.
Nos ajouts : integration dans le pipeline TypeScript/AdonisJS, interfaces TypeScript, integration BullMQ.

---

### 9g.1 Mission precise

**Mission** : Surveiller en continu chaque marche actif (en cours de consultation OU en attente de resultat) pour detecter les Q/R, modifications, notifications et resultats d'attribution. Declencher les actions post-attribution (demande de rapport d'analyse si rejet).

| Attribut | Detail |
|----------|--------|
| **Nom** | `tender_monitor` / Sous-Agent 9g |
| **Expertise** | Suivi plateforme, veille notifications, droit post-attribution, analyse concurrentielle |
| **Frequence** | Toutes les 4 heures pour les marches en phase consultation, 1x/jour pour les marches en attente de resultat |
| **Input** | Liste des marches actifs (en preparation, deposes, en attente) |
| **Output** | Alertes Q/R, modifications DCE, resultats attribution, rapports de rejet, RETEX |

---

### 9g.2 Les 3 phases (Jonathan)

### PHASE 1 -- Pendant la consultation (entre publication et deadline)

- Surveiller la plateforme de depot pour les nouvelles Q/R publiees par l'acheteur
- Detecter les modifications du DCE (rectificatifs, avenants, nouveaux documents)
- Detecter les reports de deadline
- Alerter immediatement l'equipe si une Q/R ou modification impacte notre reponse
- Verifier si les reponses aux questions modifient notre strategie technique ou prix
- Preparer les questions a soumettre a l'acheteur (via Decision Gate -> Jonathan)

### PHASE 2 -- Apres depot, en attente de resultat

- Surveiller la plateforme pour la notification de resultat
- Surveiller le BOAMP pour l'avis d'attribution
- Surveiller data.gouv.fr/DECP pour les donnees essentielles du marche
- Detecter si Axiom est retenu ou rejete

### PHASE 3 -- Post-attribution (si rejete)

- Declencher automatiquement la demande d'information au pouvoir adjudicateur
- Collecter et archiver toutes les informations obtenues
- Alimenter la base de connaissances pour ameliorer les futures reponses

---

### 9g.3 Obligations legales exploitees par le Moniteur (Jonathan)

```
PENDANT LA CONSULTATION
=======================
Art. R2132-6 : L'acheteur DOIT publier les Q/R a TOUS les candidats
  → Toute clarification est partagee de maniere anonyme et egale
  → Obligation d'egalite de traitement entre candidats
  → Si modification substantielle du DCE → prolongation du delai obligatoire

NOTIFICATION DE REJET
=====================
Art. R2181-1 : L'acheteur DOIT notifier les candidats evinces
  → "Des que possible" apres la decision d'attribution
  → Notification ecrite (electronique acceptee)
  → Doit indiquer les motifs du rejet

DELAI DE STANDSTILL (procedures formalisees)
============================================
Art. R2182-1 : Delai de 11 jours minimum entre notification et signature
  → 16 jours si notification par courrier
  → Pendant ce delai : possibilite de refere pre-contractuel
  → MAPA : pas de standstill obligatoire, mais bonne pratique

DROIT A L'INFORMATION DU CANDIDAT REJETE
=========================================
Art. R2181-3 : Sur demande ecrite, l'acheteur DOIT fournir sous 15 jours :
  1. Le nom du laureat (ou des laureats si allotissement)
  2. Les motifs detailles du rejet de l'offre
  3. Les caracteristiques et avantages de l'offre retenue
  4. Le montant du marche attribue (ou fourchette)
  5. Pour les procedures formalisees : le score du candidat et du laureat

Art. R2184-6 : Rapport de presentation de la procedure
  → Document interne de l'acheteur, mais communicable
  → Contient : analyse des offres, grille de notation, justification du choix

PUBLICATION DES DONNEES
=======================
Art. L2196-2 + Art. R2196-1 : DECP (Donnees Essentielles de la Commande Publique)
  → Publication obligatoire sur data.gouv.fr dans les 2 mois
  → Contenu : acheteur, objet, laureat, montant, duree, procedure
  → Seuil : > 40 000 EUR HT

Avis d'attribution BOAMP :
  → Obligatoire pour procedures formalisees (> 221K EUR)
  → Recommande pour MAPA > 90K EUR
  → Contenu : laureat, montant, nombre d'offres recues
```

---

### 9g.4 Workflow post-rejet automatise (Jonathan)

```
ETAPE 1 -- Detection du rejet (J+0)
  → Le Moniteur detecte la notification de rejet sur la plateforme
  → Alerte Decision Gate + Jonathan

ETAPE 2 -- Demande d'information (J+1)
  → Envoi automatique d'un courrier type a l'acheteur (valide par Jonathan)
  → Demande au titre de l'art. R2181-3 :
    - Nom du laureat
    - Motifs detailles du rejet
    - Caracteristiques de l'offre retenue
    - Score d'Axiom vs score du laureat
    - Montant du marche attribue

ETAPE 3 -- Reception et analyse (J+15 max)
  → L'acheteur a 15 jours pour repondre
  → Le Moniteur relance si pas de reponse a J+10
  → A reception : extraction et structuration des donnees

ETAPE 4 -- Capitalisation (J+16)
  → Archivage dans /historique/[ref-marche]/
  → Mise a jour de la base de connaissances :
    - Prix du marche attribue → calibrer les futurs chiffrages
    - Score technique Axiom → identifier les faiblesses
    - Nom du concurrent gagnant → enrichir la veille concurrentielle
    - Motifs de rejet → ameliorer les futurs memoires
  → Generation d'un retour d'experience (RETEX)

ETAPE 5 -- RETEX (J+17)
  → Rapport synthetique pour Jonathan (voir template ci-dessous)
```

---

### 9g.5 Modele de courrier post-rejet (Jonathan)

```
Objet : Demande d'information -- Marche [reference]
Article R2181-3 du Code de la commande publique

Madame, Monsieur,

Par la presente, nous accusons reception de la notification
de rejet de notre offre pour le marche [reference] - [objet].

Conformement aux dispositions de l'article R2181-3 du Code
de la commande publique, nous vous serions reconnaissants
de bien vouloir nous communiquer :

1. Le nom de l'attributaire du marche
2. Les motifs detailles du rejet de notre offre
3. Les caracteristiques et avantages relatifs de l'offre retenue
4. Le montant du marche attribue
5. Les notes obtenues par notre societe et par l'attributaire
   sur chacun des criteres d'attribution

Ces informations nous permettront d'ameliorer la qualite
de nos futures propositions.

Nous vous remercions par avance et restons a votre disposition.

Cordialement,
Jonathan Dewaele
President -- UNIVILE SAS (Axiom Marketing)
```

---

### 9g.6 Template RETEX (Jonathan)

```
+---------------------------------------------+
| RETEX -- [Ref marche]                        |
|                                             |
| RESULTAT : REJETE                           |
| LAUREAT  : [Nom] -- [Montant] EUR HT        |
|                                             |
| NOS SCORES vs LAUREAT :                     |
|   Technique : 14/20 vs 17/20                |
|   Prix      : 8/10  vs 7/10                 |
|   Total     : 22/30 vs 24/30                |
|                                             |
| MOTIFS DE REJET :                           |
|   - Methodologie jugee insuffisante         |
|   - Manque de references collectivites      |
|                                             |
| LECONS POUR LA SUITE :                      |
|   → Etoffer la section methodologie         |
|   → Ajouter + de references secteur public  |
|   → Notre prix etait competitif (+14%)      |
|                                             |
| CONCURRENT A SURVEILLER :                   |
|   [Nom laureat] -- actif sur les marches 974 |
+---------------------------------------------+
```

---

### 9g.7 Tableau des alertes (Jonathan)

| # | Evenement | Urgence | Action |
|---|-----------|---------|--------|
| 1 | Nouvelle Q/R publiee par l'acheteur | HAUTE | Analyser impact sur notre reponse, alerter Analyseur 9a + Redacteur 9e |
| 2 | Modification du DCE (rectificatif) | HAUTE | Retelecharger DCE, relancer analyse des deltas, alerter toute l'equipe |
| 3 | Report de deadline | MOYENNE | Mettre a jour le retroplanning |
| 4 | Nouvelle question d'un concurrent (anonyme) | BASSE | Archiver, analyser si ca revele une strategie concurrente |
| 5 | Notification de resultat (gagne) | HAUTE | Celebration + preparation signature AE + pieces laureat |
| 6 | Notification de resultat (perdu) | HAUTE | Declencher workflow post-rejet (demande info art. R2181-3) |
| 7 | Avis d'attribution BOAMP | BASSE | Archiver, extraire donnees marche |
| 8 | Publication DECP data.gouv.fr | BASSE | Extraire montant et laureat, enrichir base de connaissances |
| 9 | Pas de nouvelle depuis 30j apres depot | MOYENNE | Relancer l'acheteur pour connaitre l'etat de la procedure |

---

### 9g.8 Integration data.gouv.fr/DECP (Jonathan)

Le Moniteur exploite les Donnees Essentielles de la Commande Publique (DECP) publiees sur data.gouv.fr :

```
EXPLOITATION DECP
=================

Source : https://www.data.gouv.fr/fr/datasets/decp/
Seuil : marches > 40 000 EUR HT
Delai publication : 2 mois apres attribution (obligation legale)

Donnees extraites :
  - Acheteur (SIRET, nom)
  - Objet du marche
  - Laureat (SIRET, nom)
  - Montant attribue
  - Duree du marche
  - Type de procedure (MAPA, AO ouvert, etc.)
  - Date de notification

Utilisation par le Moniteur :
  1. Verification croisee avec les resultats plateforme
  2. Extraction du montant reel attribue (calibration prix)
  3. Identification du laureat (enrichissement veille concurrentielle)
  4. Historique des attributions par acheteur (pattern d'achat)
```

---

### 9g.9 Workflow complet Moniteur (schema Jonathan)

```
+-------------------------------------------------------+
|  TENDER MONITOR (continu, toutes les 4h)               |
|                                                         |
|  PENDANT LA CONSULTATION (avant deadline) :             |
|  → Surveille les Q/R publiees par l'acheteur            |
|  → Detecte les modifications DCE / rectificatifs        |
|  → Detecte les reports de deadline                      |
|  → Si impact sur notre reponse → ALERTE equipe          |
|                                                         |
|  APRES DEPOT (en attente de resultat) :                 |
|  → Surveille la plateforme pour notification resultat   |
|  → Surveille BOAMP pour avis d'attribution              |
|  → Surveille data.gouv.fr/DECP pour donnees marche      |
|  → Relance si pas de nouvelle apres 30 jours            |
|                                                         |
|  SI GAGNE :                                             |
|  → Alerte Jonathan (signature AE + pieces laureat)      |
|  → Preparer Kbis, URSSAF, fiscale (si pas deja a jour)  |
|  → Verifier validite certificat signature electronique  |
|                                                         |
|  SI PERDU :                                             |
|  → Envoyer demande info (art. R2181-3) sous 24h         |
|  → A reception reponse : generer RETEX                  |
|  → Alimenter base de connaissances :                    |
|    - Prix laureat → calibrer futurs chiffrages          |
|    - Scores → identifier faiblesses memoire technique   |
|    - Nom concurrent → enrichir veille concurrentielle   |
|  → Archiver dans /historique/[ref-marche]/              |
+-------------------------------------------------------+
```

---

### 9g.10 Code du sous-agent 9g (nous -- integration pipeline)

```typescript
// agents/appels-offres/9g-moniteur-post-depot/index.ts

import { Queue, Worker } from 'bullmq'
import { db } from '../../shared/database'

// --- Types ---
interface MarcheActif {
  reference: string
  titre: string
  acheteur: string
  date_depot: string | null         // null = pas encore depose
  date_limite: string
  plateforme_url: string
  phase: 'consultation' | 'depose' | 'attente_resultat' | 'termine'
  resultat: 'gagne' | 'perdu' | 'en_attente' | null
}

interface AlerteMoniteur {
  type:
    | 'nouvelle_qr'
    | 'modification_dce'
    | 'report_deadline'
    | 'question_concurrent'
    | 'resultat_gagne'
    | 'resultat_perdu'
    | 'avis_attribution_boamp'
    | 'publication_decp'
    | 'silence_30j'
  urgence: 'HAUTE' | 'MOYENNE' | 'BASSE'
  reference_marche: string
  detail: string
  action_requise: string
  date_detection: string
}

interface RETEX {
  reference_marche: string
  titre_marche: string
  resultat: 'GAGNE' | 'REJETE'
  laureat: { nom: string; montant_ht: number | null }
  scores: {
    axiom: { technique: number; prix: number; total: number }
    laureat: { technique: number; prix: number; total: number }
  } | null
  motifs_rejet: string[]
  lecons: string[]
  concurrent_a_surveiller: string | null
  date_retex: string
}

// --- Courrier post-rejet (template Jonathan) ---
function genererCourrierPostRejet(marche: MarcheActif): string {
  return `Objet : Demande d'information -- Marche ${marche.reference}
Article R2181-3 du Code de la commande publique

Madame, Monsieur,

Par la presente, nous accusons reception de la notification
de rejet de notre offre pour le marche ${marche.reference} - ${marche.titre}.

Conformement aux dispositions de l'article R2181-3 du Code
de la commande publique, nous vous serions reconnaissants
de bien vouloir nous communiquer :

1. Le nom de l'attributaire du marche
2. Les motifs detailles du rejet de notre offre
3. Les caracteristiques et avantages relatifs de l'offre retenue
4. Le montant du marche attribue
5. Les notes obtenues par notre societe et par l'attributaire
   sur chacun des criteres d'attribution

Ces informations nous permettront d'ameliorer la qualite
de nos futures propositions.

Nous vous remercions par avance et restons a votre disposition.

Cordialement,
Jonathan Dewaele
President -- UNIVILE SAS (Axiom Marketing)`
}

// --- Worker BullMQ ---
const monitorQueue = new Queue('agent9g-monitor', {
  connection: { host: 'localhost', port: 6379 }
})

// Planification : toutes les 4h pour consultation, 1x/jour pour attente_resultat
async function schedulerMonitoring() {
  const marchesActifs = await db.query<MarcheActif[]>(
    `SELECT * FROM marches_actifs WHERE phase != 'termine'`
  )

  for (const marche of marchesActifs) {
    const interval = marche.phase === 'consultation' ? '4h' : '24h'
    await monitorQueue.add('check-marche', {
      reference: marche.reference,
      phase: marche.phase,
      plateforme_url: marche.plateforme_url
    }, {
      repeat: { pattern: interval === '4h' ? '0 */4 * * *' : '0 8 * * *' }
    })
  }
}

// --- Workflow post-rejet complet ---
async function workflowPostRejet(marche: MarcheActif): Promise<void> {
  // Etape 1 : Alerter
  const alerte: AlerteMoniteur = {
    type: 'resultat_perdu',
    urgence: 'HAUTE',
    reference_marche: marche.reference,
    detail: `Marche ${marche.reference} - ${marche.titre} : offre rejetee`,
    action_requise: 'Declencher demande info art. R2181-3',
    date_detection: new Date().toISOString()
  }
  await notifierEquipe(alerte)

  // Etape 2 : Generer courrier (J+1)
  const courrier = genererCourrierPostRejet(marche)
  await db.query(
    `INSERT INTO courriers_post_rejet (reference, contenu, statut, date_envoi)
     VALUES ($1, $2, 'a_valider', NOW())`,
    [marche.reference, courrier]
  )
  // Jonathan valide avant envoi

  // Etape 3 : Planifier relance J+10 si pas de reponse
  await monitorQueue.add('relance-post-rejet', {
    reference: marche.reference
  }, {
    delay: 10 * 24 * 60 * 60 * 1000  // 10 jours
  })
}

// --- Generation RETEX ---
async function genererRETEX(
  marche: MarcheActif,
  reponseAcheteur: any
): Promise<RETEX> {
  return {
    reference_marche: marche.reference,
    titre_marche: marche.titre,
    resultat: 'REJETE',
    laureat: {
      nom: reponseAcheteur.nom_laureat || '[Non communique]',
      montant_ht: reponseAcheteur.montant_attribue || null
    },
    scores: reponseAcheteur.scores ? {
      axiom: reponseAcheteur.scores.axiom,
      laureat: reponseAcheteur.scores.laureat
    } : null,
    motifs_rejet: reponseAcheteur.motifs || [],
    lecons: analyserLecons(reponseAcheteur),
    concurrent_a_surveiller: reponseAcheteur.nom_laureat || null,
    date_retex: new Date().toISOString()
  }
}

function analyserLecons(reponse: any): string[] {
  const lecons: string[] = []
  if (reponse.scores) {
    const ecart = reponse.scores.laureat.technique - reponse.scores.axiom.technique
    if (ecart > 2) lecons.push('Etoffer la section technique du memoire')
    const ecartPrix = reponse.scores.axiom.prix - reponse.scores.laureat.prix
    if (ecartPrix > 1) lecons.push('Notre prix est competitif -- maintenir la strategie')
    if (ecartPrix < -1) lecons.push('Revoir la strategie prix a la baisse')
  }
  if (reponse.motifs?.some((m: string) => m.includes('reference')))
    lecons.push('Ajouter plus de references dans le secteur concerne')
  if (reponse.motifs?.some((m: string) => m.includes('methodologie')))
    lecons.push('Etoffer la section methodologie')
  return lecons
}

async function notifierEquipe(alerte: AlerteMoniteur): Promise<void> {
  // Notification via le systeme existant (email, Slack, SMS)
  console.log(`[9g ALERTE ${alerte.urgence}] ${alerte.detail}`)
  await db.query(
    `INSERT INTO alertes_moniteur (type, urgence, reference, detail, action, date_detection)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [alerte.type, alerte.urgence, alerte.reference_marche,
     alerte.detail, alerte.action_requise, alerte.date_detection]
  )
}

// --- Surveillance DECP (data.gouv.fr) ---
async function checkDECP(reference: string): Promise<any | null> {
  // Appel API data.gouv.fr/DECP pour verifier publication
  // Seuil : marches > 40 000 EUR HT
  // Delai publication : 2 mois apres attribution
  const response = await fetch(
    `https://www.data.gouv.fr/api/1/datasets/decp/?q=${encodeURIComponent(reference)}`
  )
  if (!response.ok) return null
  const data = await response.json()
  return data.results?.[0] || null
}

export {
  schedulerMonitoring, workflowPostRejet, genererRETEX,
  genererCourrierPostRejet, AlerteMoniteur, RETEX, MarcheActif
}
```

---

### 9g.11 Fiche technique resumee 9g

| Parametre | Valeur |
|-----------|--------|
| **Nom** | Sous-Agent 9g -- Moniteur Post-Depot |
| **Declencheur** | Continu (cron) -- 4h pendant consultation, 1x/jour apres depot |
| **Input** | Liste des marches actifs (BDD PostgreSQL) |
| **Output** | Alertes, courriers post-rejet, RETEX, donnees DECP |
| **3 phases** | Consultation, Attente resultat, Post-attribution |
| **9 types d'alertes** | Q/R, modif DCE, report, question concurrent, gagne, perdu, BOAMP, DECP, silence 30j |
| **Post-rejet** | Courrier automatique art. R2181-3, relance J+10, RETEX J+17 |
| **Sources de donnees** | Plateforme depot, BOAMP API, data.gouv.fr/DECP |
| **Capitalisation** | Archivage /historique/, mise a jour base connaissances, calibration prix |
| **Stack** | TypeScript (AdonisJS), BullMQ (cron jobs), PostgreSQL, Playwright (scraping) |
| **Cout** | ~0 EUR (scraping + API publiques) |

---
---


---
