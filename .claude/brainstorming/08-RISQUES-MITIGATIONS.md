# Registre Complet des Risques et Mitigations

**Ce document catalogue tous les risques identifiés** pendant le brainstorm, classés par catégorie et sévérité, avec des mitigations concrètes.

---

## Classification des Risques

| Sévérité | Définition | Exemples |
|----------|-----------|----------|
| **EXISTENTIEL** | Peut tuer le projet ou l'entreprise | Amende CNIL, perte de la base de données |
| **CRITIQUE** | Impact majeur nécessitant une intervention immédiate | Domaine email blacklisté, compte LinkedIn banni |
| **ÉLEVÉ** | Impact significatif sur la performance | API critique indisponible, scoring incorrect |
| **MODÉRÉ** | Impact gérable avec des ajustements | Coûts supérieurs aux prévisions, latence |
| **FAIBLE** | Impact mineur | Bug UI dashboard, formatage rapport |

---

## 1. Risques Juridiques / RGPD

### R-001 : Amende CNIL pour Collecte LinkedIn
**Sévérité : EXISTENTIEL**
**Probabilité : 15-25% (si scraping LinkedIn)**

**Description :** La CNIL a condamné KASPR à 240K EUR en décembre 2024 pour avoir collecté des données de contacts LinkedIn ayant limité leur visibilité. Netrows, SignalsAPI, et Waalaxy opèrent de manière similaire. La CNIL a annoncé une "politique rigoureuse et dissuasive" pour 2025.

**Conséquences si réalisé :**
- Amende financière (100K-500K EUR pour les PME)
- Obligation de supprimer TOUTES les données collectées illégalement
- Interdiction de poursuivre la collecte
- Dommage réputationnel auprès des clients et prospects

**Mitigations :**
1. Obtenir un avis juridique ÉCRIT d'un avocat spécialisé CNIL/prospection B2B AVANT tout développement LinkedIn
2. Utiliser UNIQUEMENT les APIs LinkedIn officielles (Marketing API, Sales Navigator) avec consentement documenté
3. Documenter la base légale du traitement (intérêt légitime B2B — nécessite une analyse de proportionnalité)
4. Tenir un registre des traitements RGPD
5. Implémenter le droit à l'effacement avec propagation dans TOUTES les tables
6. Ne JAMAIS collecter les données de contacts ayant restreint leur visibilité LinkedIn

**Edge case :** Même si les données LinkedIn sont "publiques", la CNIL considère que la collecte systématique sans information des personnes est illégale. Le caractère "public" ne suffit pas.

### R-002 : Non-Conformité Prospection Email B2B
**Sévérité : ÉLEVÉ**
**Probabilité : 10-15%**

**Description :** Le cold email B2B est toléré en France sous certaines conditions (intérêt légitime, lien avec l'activité professionnelle du destinataire). Mais les règles sont strictes.

**Mitigations :**
1. Chaque email doit contenir un lien de désinscription fonctionnel
2. La désinscription doit être effective immédiatement (pas "dans 48h")
3. Le blacklist anti-recontact doit être vérifié AVANT chaque envoi
4. Les emails doivent être envoyés à des adresses professionnelles uniquement
5. L'expéditeur doit être clairement identifié (nom, entreprise, adresse)
6. Le contenu doit être en rapport avec l'activité professionnelle du destinataire

---

## 2. Risques Techniques

### R-003 : Destruction de Domaine Email
**Sévérité : CRITIQUE**
**Probabilité : 20-30% (sans précautions)**

**Description :** Un seul envoi avec >0.3% de spam rate chez Gmail peut déclencher un "death spiral" : spam rate élevé → engagement faible → réputation chute → plus de spam → domaine irrécupérable. Si le domaine principal est utilisé, tous les emails transactionnels et clients sont impactés.

**Conséquences si réalisé :**
- Domaine de cold outreach blacklisté (irrécupérable)
- Si domaine principal touché : emails clients en spam
- Perte de crédibilité commerciale
- Coût de remplacement : 30+ jours de warm-up d'un nouveau domaine

**Mitigations :**
1. JAMAIS utiliser le domaine principal pour le cold outreach
2. 3 domaines dédiés en rotation
3. Warm-up de 30 jours minimum par domaine
4. Maximum 50 emails/jour/domaine au début (monter progressivement)
5. Monitoring quotidien : bounce rate <3%, spam rate <0.3%
6. Si un domaine dépasse les seuils → pause immédiate + investigation
7. Lien de désinscription dans chaque email
8. Suppression immédiate des hard bounces

### R-004 : Panne Claude API
**Sévérité : ÉLEVÉ**
**Probabilité : 10-15%/an (incidents documentés mars 2026)**

**Description :** Claude API a connu des pannes significatives les 2-3 mars 2026 (HTTP 500 + 529 server overloaded). Sans fallback, les agents 4 (rédaction), 5c (classification), 6 (nurturing), et 7 (rapports) sont paralysés.

**Mitigations :**
1. Fallback chain : Claude → template statique (jamais de blocage total)
2. Cache des 100 dernières générations pour réutilisation
3. File d'attente pour les tâches en échec → retry automatique toutes les 5 minutes
4. Alerte Slack si >10 échecs Claude en 1 heure
5. Mode dégradé : emails templates + classification manuelle

### R-005 : Perte de Données Redis/BullMQ
**Sévérité : CRITIQUE**
**Probabilité : 5-10% (sans configuration correcte)**

**Description :** Si `maxmemory-policy` n'est pas configuré à `noeviction`, Redis peut éviter arbitrairement des clés de queue BullMQ, causant une perte de jobs.

**Mitigations :**
1. Configuration Redis obligatoire : `maxmemory-policy: noeviction`
2. Monitoring mémoire Redis (alerte à 80% utilisation)
3. Persistence Redis : AOF (Append Only File) activé
4. Backup Redis quotidien
5. Ne jamais utiliser les event listeners BullMQ pour de la logique transactionnelle
6. Configurer `enableOfflineQueue: false` pour éviter les blocages silencieux

### R-006 : Ban LinkedIn
**Sévérité : CRITIQUE**
**Probabilité : 30-40% (avec Waalaxy)**

**Description :** 23% des utilisateurs de Waalaxy font face à des restrictions dans les 90 jours. LinkedIn utilise du fingerprinting GPU, de l'analyse de régularité, et de la biométrie comportementale pour détecter les bots.

**Progression du ban :**
1. Restrictions de profil (shadow ban)
2. Message delivery réduite
3. Lockdown du compte (vérification ID requise)
4. Suspension permanente

**Mitigations :**
1. PAS de Waalaxy/automation LinkedIn sans validation juridique
2. Si automatisation LinkedIn validée juridiquement :
   - Max 15-20 connexions/jour (pas 25)
   - Gaps aléatoires entre les actions (120-300 secondes)
   - Pas d'activité entre 22h et 7h
   - Variété dans les messages (pas de templates identiques)
   - Monitoring du taux d'échec des actions (>30% = pause immédiate)
3. Plan de recovery si ban :
   - Pause immédiate 48h
   - Reprise manuelle (10 actions/jour pendant 7 jours)
   - Montée progressive sur 30 jours

---

## 3. Risques Business

### R-007 : Funnel Non Validé
**Sévérité : ÉLEVÉ**
**Probabilité : 30-40% (si pas de test préalable)**

**Description :** Si le cold email B2B pour les services web en France a un taux de réponse <1%, tout le système est construit sur une hypothèse fausse. Le taux moyen de l'industrie est 1-3%, mais les specs annoncent 3-8%.

**Mitigations :**
1. Test manuel de 30 jours AVANT tout développement (Phase 0)
2. Critères Go/No-Go clairs (>3% reply rate = GO)
3. Si reply rate <1% : pivoter vers l'inbound, le réseau, ou les partenariats
4. Ne pas automatiser un funnel qui ne convertit pas manuellement

### R-008 : Taux de Conversion Surestimé
**Sévérité : ÉLEVÉ**
**Probabilité : 40-50%**

**Description :** Les specs annoncent un win rate de 35-40%, mais le taux moyen pour les agences web en France est probablement plus proche de 15-25%. Si le win rate est 15%, il faut 2x plus de leads pour le même CA.

**Mitigations :**
1. Planifier pour un win rate de 20% (scénario conservateur)
2. Mesurer le win rate réel dès les 10 premiers deals
3. Ajuster le volume de leads nécessaire en conséquence

### R-009 : Dépendance à Jonathan (SPOF Humain)
**Sévérité : MODÉRÉ**
**Probabilité : 60-70% (un fondateur est toujours busy)**

**Description :** Jonathan est le single point of failure pour la qualification HOT (<2h SLA), les rendez-vous discovery, et la validation des devis. Si Jonathan est en rendez-vous client, les HOT leads refroidissent.

**Mitigations :**
1. Alertes multi-canal (Slack + SMS + Email) pour les HOT leads
2. Messages de réponse automatiques ("Merci pour votre intérêt, je reviens vers vous dans l'heure")
3. À terme : recruter un commercial junior pour le suivi des WARM/COLD
4. Prioriser la qualité du ciblage (peu de HOT mais tous traités) plutôt que le volume

---

## 4. Risques Financiers

### R-010 : TCO Sous-Estimé
**Sévérité : MODÉRÉ**
**Probabilité : 80-90%**

**Description :** Le budget annoncé de 957 EUR/mois ne couvre que les APIs. Le TCO réel inclut : développement, maintenance, infra, monitoring, incidents, compliance, formation.

**Mitigations :**
1. Budget réaliste = 3-5x le budget API sur 2 ans
2. Approche par phases pour lisser l'investissement
3. Utilisation maximum de sources gratuites (INSEE, BOAMP, outils npm)
4. n8n self-hosted plutôt que SaaS payants
5. Model routing LLM (Haiku/Sonnet/Opus) pour réduire les coûts Claude de 60-80%

### R-011 : Coûts API en Hausse
**Sévérité : FAIBLE-MODÉRÉ**
**Probabilité : 50% sur 12 mois**

**Description :** Les prix des APIs (Claude, Dropcontact, Hunter, etc.) peuvent augmenter sans préavis. Anthropic a déjà changé sa structure de pricing plusieurs fois.

**Mitigations :**
1. Prompt caching pour réduire la dépendance au pricing par token
2. Alternatives open-source identifiées pour chaque API (voir 06-STACK-TECHNIQUE.md)
3. Budget tampon de 20% pour absorber les hausses de prix
4. Monitoring des coûts par agent via Langfuse

---

## 5. Risques de Maintenabilité

### R-012 : API Breaking Changes
**Sévérité : MODÉRÉ**
**Probabilité : 90% sur 12 mois (avec 15+ APIs)**

**Description :** Avec 15+ APIs externes, au moins 1 breaking change par mois est statistiquement certain. Un changement non détecté peut casser silencieusement un agent.

**Mitigations :**
1. Tests d'intégration automatisés pour chaque API (run quotidien)
2. Versioning explicite de chaque SDK d'API
3. Monitoring des changelogs des APIs critiques
4. Abstraction layer : ne jamais appeler une API directement, toujours via un wrapper

### R-013 : Schema Database Drift
**Sévérité : MODÉRÉ**
**Probabilité : 70% après 6 mois**

**Description :** Avec 40+ tables et des vues matérialisées, chaque modification de schema peut casser des dépendances en cascade. Ajouter une colonne à `prospects` peut nécessiter de recréer 5+ vues.

**Mitigations :**
1. Migrations PostgreSQL versionnées (TypeORM, Prisma, ou Knex)
2. Limiter le nombre de vues matérialisées au strict nécessaire
3. Tests de migration avant déploiement
4. Documentation du schéma à jour (généré automatiquement)

### R-014 : Prompt Drift LLM
**Sévérité : MODÉRÉ**
**Probabilité : 80% sur 6 mois (sans monitoring)**

**Description :** La qualité des outputs Claude peut se dégrader silencieusement si les prompts ne sont pas ajustés aux changements de modèle ou aux évolutions du marché.

**Mitigations :**
1. Langfuse pour tracer 100% des appels Claude avec scores de qualité
2. Revue hebdomadaire d'un échantillon de 10 emails générés
3. A/B testing continu sur les variantes de prompt
4. Versionning des prompts dans le code (pas en dur, en configuration)

---

## Matrice de Risques — Vue Synthétique

```
IMPACT
  ▲
  │ EXISTENTIEL │ R-001 (CNIL)    │                    │
  │             │                  │                    │
  │ CRITIQUE    │ R-003 (email)   │ R-005 (Redis)     │ R-006 (LinkedIn)
  │             │                  │                    │
  │ ÉLEVÉ       │ R-007 (funnel)  │ R-004 (Claude)    │ R-008 (conversion)
  │             │                  │                    │
  │ MODÉRÉ      │ R-009 (SPOF)    │ R-010 (TCO)       │ R-012-14 (maintenance)
  │             │                  │                    │
  │ FAIBLE      │                  │ R-011 (prix API)  │
  │             │                  │                    │
  └─────────────┴──────────────────┴────────────────────┴──────── PROBABILITÉ ►
                  FAIBLE (<15%)     MODÉRÉE (15-50%)     ÉLEVÉE (>50%)
```

---

*Pour le détail du budget et TCO, voir `09-BUDGET-TCO.md`.*
