# 05 — Kaspr — LinkedIn Phone Extraction

## Fiche Service

| Attribut | Valeur |
|----------|--------|
| **Service** | Kaspr |
| **URL** | https://www.kaspr.io |
| **Rôle** | Extraction téléphone + email depuis LinkedIn (Agent 2a) |
| **Coût** | 79 EUR/mois (3 000 crédits) |
| **Plan évalué** | Start-up plan |

## Comment ça fonctionne (analyse technique)

### Le modèle Kaspr

Kaspr est fondamentalement **différent** des autres services analysés :

```
Dropcontact = ALGORITHME (calcul)
Hunter.io   = CRAWLING WEB (indexation publique)
Kaspr       = SCRAPING LINKEDIN (extraction données privées)
```

### Mécanique d'extraction

1. **Extension Chrome** installée par l'utilisateur
2. L'utilisateur navigue sur LinkedIn et visite des profils
3. Kaspr extrait les données du profil :
   - Email professionnel
   - Numéro de téléphone (quand disponible)
   - Poste, entreprise, localisation
4. Ces données alimentent une **base centralisée de 160 millions de contacts**
5. Quand un autre utilisateur cherche le même profil, les données sont servies depuis la base

### Ce qui pose problème

Kaspr collecte des données même de profils qui ont **masqué leur visibilité** (connexions 1er/2e degré uniquement). C'est précisément ce qui a été sanctionné par la CNIL.

## Sanction CNIL — Décembre 2024

### Faits

| Élément | Détail |
|---------|--------|
| **Date sanction** | 5 décembre 2024 |
| **Montant** | 240 000 EUR |
| **CA Kaspr** | ~3 000 000 EUR |
| **Résultat net** | ~1 000 000 EUR |
| **Amende / CA** | ~8% |

### Manquements retenus par la CNIL

1. **Article 6 RGPD — Base légale** : Collecte de données de profils ayant masqué leur visibilité = collecte illicite. LinkedIn permet aux utilisateurs de restreindre la visibilité de leurs coordonnées. Kaspr passait outre.

2. **Article 5.1.e RGPD — Limitation de conservation** : Conservation des données pendant 5 ans avec renouvellement à chaque mise à jour. Durée jugée disproportionnée.

3. **Articles 12 et 14 RGPD — Information des personnes** : Pendant 4 ans, aucune information aux personnes dont les données étaient collectées. En 2022, un email en anglais uniquement a été envoyé — jugé insuffisant.

4. **Article 15 RGPD — Droit d'accès** : Réponses incomplètes aux demandes d'accès.

### Ordonnance de mise en conformité
- **Délai** : 6 mois (jusqu'au 18 juin 2025)
- **Obligations** : Cesser la collecte des profils à visibilité restreinte + supprimer les données collectées illicitement

### Source officielle
[CNIL — Aspiration de données : sanction de 240 000 euros à l'encontre de KASPR](https://www.cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr)

## Peut-on reproduire ?

### Techniquement : Oui (mais c'est illégal)

| Méthode | Faisabilité | Légalité |
|---------|-------------|----------|
| Scraping LinkedIn via Puppeteer/Playwright | Possible mais fragile | **Interdit** par CGU LinkedIn |
| Extension Chrome comme Kaspr | Possible | **Interdit** — même modèle = même sanction |
| LinkedIn API officielle | Très limitée (pas d'accès aux téléphones) | Légal mais inutile |
| LinkedIn Sales Navigator API | Accès limité, pas de téléphone | Légal mais coûteux |

### Le scraping LinkedIn en France — État des lieux

| Aspect | Réalité |
|--------|---------|
| **CGU LinkedIn** | Scraping explicitement interdit, Section 8.2 |
| **Jurisprudence US (hiQ v. LinkedIn)** | Le scraping de données publiques est légal aux USA — mais ce précédent ne s'applique PAS en UE |
| **Jurisprudence UE/France** | La CNIL sanctionne systématiquement : Kaspr (240K), Clearview AI (20M), Lusha (en cours) |
| **RGPD Article 6** | Le scraping de données professionnelles peut être justifié par l'intérêt légitime — MAIS pas si la personne a masqué ses données |

### Le vrai problème : le téléphone

Le numéro de téléphone mobile est une **donnée personnelle sensible** en droit français. Contrairement à l'email professionnel (qui peut relever de l'intérêt légitime B2B), le téléphone personnel n'a aucune base légale solide pour la prospection automatisée non sollicitée.

## Verdict

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Faisabilité technique | 5/10 | Techniquement faisable mais juridiquement interdit |
| Coût de développement | N/A | Ne pas reproduire |
| Fiabilité | N/A | Ne pas reproduire |
| Conformité RGPD | 1/10 | Risque d'amende CNIL certain |
| Scalabilité | N/A | Ne pas reproduire |

**Recommandation : NI ACHETER NI REPRODUIRE**

### Justification
1. **Risque juridique disproportionné** — Kaspr lui-même a été condamné à 240K EUR
2. **Le téléphone n'est pas prioritaire** — Le projet est email-first + LinkedIn via Waalaxy
3. **Alternative manuelle** — Quand un prospect est qualifié HOT, l'équipe commerciale peut chercher le téléphone manuellement (page contact du site, standard téléphonique, LinkedIn InMail)
4. **Économie** : 79 EUR/mois = 948 EUR/an

### Pour la Phase 3+ (si le téléphone devient nécessaire)
- Utiliser **Waalaxy** pour l'approche LinkedIn (déjà dans le projet)
- Collecter les téléphones via les **formulaires de contact** (opt-in RGPD)
- Envisager **Lusha** ou **Apollo.io** (qui ont fait des efforts RGPD) mais avec avis juridique préalable

## Sources

- [CNIL — Sanction KASPR 240 000 EUR](https://www.cnil.fr/fr/aspiration-de-donnees-sanction-de-240-000-euros-lencontre-de-la-societe-kaspr)
- [EDPB — Data scraping: KASPR fined](https://www.edpb.europa.eu/news/news/2025/data-scraping-french-supervisory-authority-fined-kaspr-eu240-000_en)
- [Analyse juridique RGPD — Gerardin Avocat](https://www.gerardin-avocat.com/sanction-de-kaspr-par-la-cnil-pour-scraping-des-donnees-non-conforme-au-rgpd/)
- [Next.ink — La CNIL sanctionne le scraping LinkedIn](https://next.ink/162375/la-cnil-sanctionne-le-scraping-sauvage-de-linkedin-par-kaspr-dune-amende-de-240-000-euros/)
