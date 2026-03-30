# 06 — Pappers — Données Entreprise France

## Fiche Service

| Attribut | Valeur |
|----------|--------|
| **Service** | Pappers |
| **URL** | https://www.pappers.fr |
| **Rôle** | Enrichissement entreprise France (Agent 2b Enrichisseur Entreprise) |
| **Coût** | ~60 EUR/mois (3 000 requêtes API) |
| **Plan évalué** | API Pro — 3 000 requêtes/mois |

## Comment ça fonctionne (analyse technique)

### Ce que fait Pappers

Pappers est un **agrégateur de données publiques**. Il ne génère aucune donnée propre — il collecte, structure et expose via API des données provenant de sources gouvernementales ouvertes.

### Sources de données de Pappers

```
Pappers agrège :
├── INSEE SIRENE → identité entreprise (SIREN, SIRET, adresse, NAF, effectif)
├── INPI / RNE   → statuts, actes, dirigeants, bénéficiaires effectifs, comptes annuels
├── BODACC       → annonces légales, procédures collectives, créations, cessions
├── RNA          → associations (registre national des associations)
└── data.gouv.fr → jeux de données complémentaires
```

### La valeur ajoutée de Pappers

| Ce que Pappers fait | Ce qu'une API brute ne fait pas |
|---------------------|-------------------------------|
| **Agrégation** — Une seule requête pour toutes les sources | Chaque source est une API différente avec des formats différents |
| **Normalisation** — Données nettoyées et structurées en JSON uniforme | Les données brutes ont des formats incohérents |
| **Recherche full-text** — Chercher par nom, activité, dirigeant | Les APIs publiques cherchent principalement par SIREN/SIRET |
| **Historique des modifications** — Timeline des événements | Il faut croiser manuellement BODACC + INPI |
| **Uptime 99.9%** — API fiable et rapide | Les APIs publiques ont des downtimes fréquents |
| **Documentation** — API bien documentée, SDKs | Les APIs publiques ont une doc variable |

## Peut-on reproduire ?

### Oui — Toutes les données sont open data

Chaque source utilisée par Pappers est gratuite et accessible :

| Source | API | Gratuit ? | Documentation |
|--------|-----|-----------|---------------|
| **INSEE SIRENE** | `api.insee.fr/entreprises/sirene/V3.11` | Oui (token gratuit) | [api.gouv.fr/les-api/sirene_v3](https://api.gouv.fr/les-api/sirene_v3) |
| **BODACC** | `bodacc.fr/api/` | Oui | [bodacc.fr/pages/api-bodacc](https://www.bodacc.fr/pages/api-bodacc/) |
| **INPI / RNE** | `data.inpi.fr/api/` | Oui (inscription) | [data.inpi.fr](https://data.inpi.fr/content/editorial/Acces_API_Entreprises) |
| **Annuaire Entreprises** | `recherche-entreprises.api.gouv.fr` | Oui | [data.gouv.fr](https://www.data.gouv.fr/dataservices/api-recherche-dentreprises) |
| **API Entreprise** | `entreprise.api.gouv.fr` | Oui (réservé administrations) | [entreprise.api.gouv.fr](https://entreprise.api.gouv.fr/catalogue) |

### Adapter existant dans le projet

L'adapter INSEE est déjà codé : `src/modules/agent-enrichisseur/infrastructure/adapters/insee.adapter.ts`

Il fournit :
- Recherche par SIREN/SIRET
- Données d'identité (raison sociale, adresse, NAF, effectif)

### Ce qu'il faut ajouter

| Adapter à coder | Données récupérées | Complexité |
|-----------------|-------------------|------------|
| **BODACC Adapter** | Procédures collectives, créations, cessions, alertes | Moyen (2-3h) |
| **INPI/RNE Adapter** | Dirigeants, bénéficiaires effectifs, comptes annuels | Moyen (3-4h) |
| **Annuaire Entreprises Adapter** | Données agrégées (backup) | Facile (1-2h) |

### Ce qu'on NE PEUT PAS reproduire facilement

1. **Recherche full-text avancée** — Pappers permet de chercher "agence web Lyon" et trouve les entreprises correspondantes. Les APIs publiques ne font que du lookup par SIREN/SIRET ou nom exact.
   - **Mitigation** : Pour le projet, on a déjà le nom de l'entreprise (Agent 1 Veilleur). On n'a besoin que du lookup, pas de la recherche.

2. **Temps de réponse** — Pappers répond en ~200ms. Agréger 3 APIs publiques prend ~500-1500ms.
   - **Mitigation** : Appels en parallèle (`Promise.all`) + cache Redis.

3. **Fiabilité** — Pappers a un uptime 99.9%. Les APIs publiques (surtout INPI) ont des downtimes.
   - **Mitigation** : Cache + retry avec backoff + graceful degradation.

## Analyse coût-bénéfice

| Aspect | Pappers (Buy) | DIY (Build) |
|--------|---------------|-------------|
| **Coût mensuel** | 60 EUR | 0 EUR |
| **Temps de dev initial** | 0 | ~8h (3 adapters) |
| **Maintenance annuelle** | 0 | ~4h (si API change) |
| **Fiabilité** | 99.9% | ~95% (dépend des APIs publiques) |
| **Données disponibles** | Tout en un | Tout sauf la recherche full-text |
| **Latence** | ~200ms | ~500-1500ms (améliorable avec cache) |

Pour 200 prospects/mois, la différence de fiabilité est négligeable. Le cache Redis couvre les downtimes ponctuels.

## Verdict

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Faisabilité technique | 9/10 | Open data, APIs documentées, adapter INSEE déjà codé |
| Coût de développement | 8/10 | ~8h de dev + ~4h/an de maintenance |
| Fiabilité | 7/10 | APIs publiques moins fiables que Pappers |
| Conformité RGPD | 10/10 | Données publiques légales, pas de scraping |
| Scalabilité | 8/10 | Rate limits généreux sur les APIs publiques |

**Recommandation : REMPLACER par agrégation d'APIs publiques**
- Économie : 60 EUR/mois = 720 EUR/an
- L'adapter INSEE est déjà là — il suffit d'ajouter BODACC + INPI
- Risque principal : downtime des APIs publiques → mitigation par cache Redis

## Sources

- [Pappers — API Documentation](https://www.pappers.fr/api/documentation)
- [Pappers — Guide complet 2025](https://www.spherescout.io/fr/blog/pappers-guide-2025/)
- [INSEE SIRENE API](https://api.gouv.fr/les-api/sirene_v3)
- [BODACC API](https://www.bodacc.fr/pages/api-bodacc/)
- [INPI — Accès aux API Entreprises](https://data.inpi.fr/content/editorial/Acces_API_Entreprises)
- [Annuaire Entreprises — data.gouv.fr](https://www.data.gouv.fr/dataservices/api-recherche-dentreprises)
