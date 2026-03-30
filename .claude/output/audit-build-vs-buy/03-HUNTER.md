# 03 — Hunter.io — Email Database & Finder

## Fiche Service

| Attribut | Valeur |
|----------|--------|
| **Service** | Hunter.io |
| **URL** | https://hunter.io |
| **Rôle** | Email finder fallback + domain search (Agent 2a Enrichisseur Contact) |
| **Coût** | 49 EUR/mois (1 500 crédits, partagé avec Agent 1) |
| **Plan évalué** | Starter — 500 recherches/mois + 1 000 vérifications/mois |

## Comment ça fonctionne (analyse technique)

### Architecture Hunter.io

Hunter.io est fondamentalement **différent** de Dropcontact :

```
Dropcontact = ALGORITHME (calcul en temps réel)
Hunter.io   = BASE DE DONNÉES (index crawlé) + algorithme en fallback
```

### Étape 1 — Crawling Web (continu)
- Hunter crawle **~100 millions de sites web** quotidiennement
- Il indexe toutes les adresses email trouvées publiquement :
  - Pages `/team`, `/about`, `/contact`, `/mentions-legales`
  - Articles de blog (auteurs)
  - Communiqués de presse
  - Profils sociaux publics
- Base totale : **500+ millions d'emails professionnels**

### Étape 2 — Domain Search
Quand tu cherches `@company.fr` :
1. Lookup dans la base crawlée → retourne tous les emails trouvés pour ce domaine
2. Pour chaque email, Hunter montre la **source exacte** (URL + date de découverte)
3. Pattern dominant détecté (ex: "chez company.fr, 80% des emails sont en `prenom.nom@`")

### Étape 3 — Email Finder (name → email)
Quand tu donnes `Jean Dupont` + `company.fr` :
1. D'abord : lookup direct dans la base → si `jean.dupont@company.fr` a été crawlé, retourné directement
2. Sinon : **pattern matching** basé sur les autres emails connus du domaine
3. Score de confiance basé sur la force du pattern match

### Étape 4 — Vérification
Chaque email retourné passe par une vérification (SMTP check similaire à Dropcontact).

## Peut-on reproduire ?

### Ce qui est IMPOSSIBLE à reproduire

| Composant | Pourquoi |
|-----------|----------|
| Base 500M emails | Nécessite des années de crawling à grande échelle |
| Infrastructure crawling | Des centaines de serveurs crawlant 100M sites/jour |
| Historique des sources | Chaque email lié à l'URL + date de découverte |

### Ce qui est reproductible mais pas utile

| Composant | Faisabilité | Mais... |
|-----------|-------------|---------|
| Scraper les pages /team d'un site | Facile | Marche pour ~20% des entreprises (celles qui ont une page team) |
| Pattern matching | Facile | Déjà couvert par Dropcontact/Reacher |
| SMTP verification | Facile | Déjà couvert par Dropcontact/Reacher |

### Analyse coût-bénéfice

Pour 200 prospects/mois, le waterfall est :
```
1. Reacher (pattern guessing + SMTP) → trouve ~70-80% des emails
2. Hunter.io (base crawlée) → trouve ~10-15% de plus
3. Restent ~10-15% introuvables
```

La question : est-ce que 10-15% de prospects supplémentaires justifient 49 EUR/mois ?
- 200 × 12.5% = **25 prospects** supplémentaires par mois
- 49 EUR / 25 = **~2 EUR par prospect supplémentaire**

**Pour un projet en phase de validation (Phase 0-1), la réponse est non.** En Phase 2+ avec des volumes plus importants, Hunter pourrait devenir pertinent.

## Verdict

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Faisabilité technique | 2/10 | La base 500M n'est pas reproductible |
| Coût de développement | N/A | Impossible à reproduire |
| Fiabilité | 8/10 | Excellente base, mais pas indispensable |
| Conformité RGPD | 6/10 | Données crawlées = zone grise RGPD |
| Scalabilité | 9/10 | Illimité côté Hunter |

**Recommandation : SUPPRIMER pour les phases 0-1, reconsidérer en Phase 2**
- Économie : 49 EUR/mois = 588 EUR/an
- Le gain marginal (10-15% de prospects en plus) ne justifie pas le coût en early stage
- Reacher couvre déjà 70-80% du besoin

## Sources

- [Hunter.io — How it works](https://hunter.io/)
- [Hunter.io API Documentation](https://hunter.io/api-documentation/v1)
- [Hunter.io Review 2026](https://www.agentledgrowth.com/agents/hunterio)
- [I Tested Hunter IO for 90 Days](https://www.fahimai.com/hunter-io)
