# 07 — Reacher — Alternative Open-Source Centrale

## Présentation

| Attribut | Valeur |
|----------|--------|
| **Projet** | Reacher |
| **URL** | https://reacher.email |
| **GitHub** | https://github.com/reacherhq/check-if-email-exists |
| **Langage** | Rust |
| **Stars GitHub** | 15 000+ |
| **Licence** | AGPL-3.0 |
| **Déploiement** | Docker self-hosted |
| **Coût** | Gratuit (self-hosted) |

## Pourquoi Reacher est la pièce centrale

Reacher remplace **3 services payants à lui seul** :

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dropcontact │     │  Hunter.io   │     │  ZeroBounce  │
│  (39 EUR/m)  │     │  (49 EUR/m)  │     │  (15 EUR/m)  │
│              │     │              │     │              │
│ Email finder │     │ Email finder │     │ Email verif  │
│ SMTP check   │     │ SMTP check   │     │ SMTP check   │
│ Catch-all    │     │ Pattern match│     │ Catch-all    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   REACHER     │
                    │   (0 EUR/m)   │
                    │               │
                    │ SMTP check    │
                    │ MX validation │
                    │ Catch-all     │
                    │ Disposable    │
                    │ Role-based    │
                    │ Syntax check  │
                    └───────────────┘
```

## Fonctionnalités détaillées

### Ce que Reacher fait

| Fonctionnalité | Détail | Équivalent SaaS |
|----------------|--------|-----------------|
| **MX Record Check** | Vérifie que le domaine a des serveurs mail | Dropcontact, ZeroBounce |
| **SMTP Verification** | Connexion SMTP + `RCPT TO:` sans envoi | Dropcontact, ZeroBounce |
| **Catch-All Detection** | Test avec adresse aléatoire | Dropcontact, ZeroBounce |
| **Disposable Email Detection** | Base 40 000+ domaines temporaires | ZeroBounce |
| **Role-Based Detection** | info@, support@, contact@ | ZeroBounce |
| **Syntax Validation** | RFC 5322 compliance | Tous |
| **Yahoo/Hotmail/Gmail handling** | Gestion spéciale des gros providers | Dropcontact |

### Ce que Reacher NE fait PAS

| Fonctionnalité manquante | Impact | Mitigation |
|--------------------------|--------|------------|
| Pattern generation (prénom+nom → email) | Il faut coder le générateur de permutations | ~2h de dev, trivial |
| Spam trap detection | Pas de base de known spam traps | Négligeable à <500 emails/mois |
| Toxic email scoring | Pas d'IA de scoring | Non critique en B2B |
| Base de données crawlée | Pas de lookup pré-indexé | Le SMTP check suffit |

## Déploiement Docker

### docker-compose (service à ajouter)

```yaml
reacher:
  image: reacherhq/backend:latest
  container_name: prospection-reacher
  restart: unless-stopped
  ports:
    - "8080:8080"  # ou port interne uniquement
  environment:
    - RCH__WORKER__THROTTLE__MAX_REQUESTS_PER_SECOND=5
    - RCH__WORKER__THROTTLE__MAX_REQUESTS_PER_DAY=500
  networks:
    - prospection-net
  security_opt:
    - no-new-privileges:true
```

### API Reacher

```bash
# Vérifier un email
curl -X POST http://localhost:8080/v0/check_email \
  -H "Content-Type: application/json" \
  -d '{"to_email": "jean.dupont@company.fr"}'
```

Réponse :
```json
{
  "input": "jean.dupont@company.fr",
  "is_reachable": "safe",
  "misc": { "is_disposable": false, "is_role_account": false },
  "mx": { "accepts_mail": true, "records": ["mx1.google.com"] },
  "smtp": { "can_connect_smtp": true, "is_deliverable": true, "is_catch_all": false },
  "syntax": { "is_valid_syntax": true }
}
```

## Intégration dans le projet NestJS

### Architecture proposée

```
src/modules/agent-enrichisseur/
├── infrastructure/
│   ├── adapters/
│   │   ├── insee.adapter.ts          ← déjà codé
│   │   ├── reacher.adapter.ts        ← à coder
│   │   ├── bodacc.adapter.ts         ← à coder
│   │   └── inpi.adapter.ts           ← à coder
│   └── services/
│       └── email-finder.service.ts   ← orchestrateur waterfall
```

### Waterfall Email Finding

```typescript
// Pseudo-code du waterfall
async findEmail(firstName: string, lastName: string, domain: string): Promise<EmailResult> {
  // 1. Générer les permutations
  const patterns = this.generatePatterns(firstName, lastName, domain);
  // ~15 permutations : prenom.nom@, p.nom@, prenom@, etc.

  // 2. Vérifier chaque permutation via Reacher
  for (const email of patterns) {
    const result = await this.reacher.verify(email);
    if (result.is_reachable === 'safe') {
      return { email, confidence: 99, source: 'smtp_verified' };
    }
  }

  // 3. Si catch-all, retourner le pattern le plus probable
  if (catchAllDetected) {
    return { email: patterns[0], confidence: 60, source: 'pattern_guess_catchall' };
  }

  // 4. Aucun email trouvé
  return { email: null, confidence: 0, source: 'not_found' };
}
```

## Contraintes et limitations

### Licence AGPL-3.0

La licence AGPL impose que **si tu modifies le code source de Reacher et que tu le distribues** (y compris via un service réseau), tu dois publier tes modifications.

**Impact pour le projet** : AUCUN — on utilise Reacher tel quel via son API Docker, sans modification du code source. L'AGPL ne s'applique pas à l'utilisation via API.

### Réputation IP

| Volume mensuel | Risque de blacklisting | Mitigation |
|----------------|----------------------|------------|
| <200 vérifications | Faible | Container Docker avec IP dédiée |
| 200-500 | Moyen | Throttling (5 req/s) + IP différente du serveur mail |
| 500-2000 | Élevé | Cloud functions en rotation (1 Lambda/vérification) |
| >2000 | Très élevé | Revenir aux services SaaS (Dropcontact/ZeroBounce) |

### Performance

| Métrique | Valeur |
|----------|--------|
| Temps moyen par vérification | 3-10 secondes (dépend du serveur distant) |
| Vérifications parallèles recommandées | 5 max (pour éviter le throttling) |
| Throughput réaliste | ~30 emails/minute |
| Pour 200 prospects × 15 patterns | ~3 000 vérifications → ~100 minutes |

## Sources

- [Reacher — Site officiel](https://reacher.email/)
- [Reacher — GitHub (check-if-email-exists)](https://github.com/reacherhq/check-if-email-exists)
- [Reacher — Docker Hub](https://hub.docker.com/r/reacherhq/backend)
- [Reacher — Pricing (self-hosted = free)](https://app.reacher.email/en/pricing)
