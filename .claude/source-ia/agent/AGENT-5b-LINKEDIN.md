# SOUS-AGENT 5b — ENVOYEUR LINKEDIN
**Agent parent** : AGENT-5-MASTER.md
**Mission** : Automatiser les connexions, messages et engagement LinkedIn de facon sure

---

### 3b. ENVOYEUR LINKEDIN

#### 3b.1 Architecture technique

```
SuiveurInput (canal=linkedin_*)
    |
    v
+-------------------------------------------+
| SOUS-AGENT 5b : ENVOYEUR LINKEDIN        |
| 1. Verifier limites journalieres          |
| 2. Randomiser timing (120-300s delay)     |
| 3. Envoyer via Waalaxy API/webhook       |
| 4. Logger action                          |
| 5. Surveiller signes de restriction       |
+-------------------------------------------+
    |
    v
Action LinkedIn executee --> Log en base
```

#### 3b.2 Integration Waalaxy

```typescript
import axios from 'axios'

interface LinkedInActionResult {
  success: boolean
  action_type: 'connection_request' | 'message' | 'profile_visit' | 'like' | 'comment'
  waalaxy_campaign_id: string | null
  sent_at: string
  delay_applied_ms: number
}

class SubAgent5b_EnvoyeurLinkedIn {
  private waalaxyBaseUrl = 'https://api.waalaxy.com/v1'
  private dailyLimits = {
    connection_requests: 25,  // Safe: 15-30/jour
    messages: 80,             // Safe: 50-100/jour
    profile_views: 150,       // Safe: 100-200/jour
    likes: 40,                // Safe: 20-50/jour
    comments: 15,             // Safe: 10-20/jour
  }

  async process(input: SuiveurInput): Promise<LinkedInActionResult> {
    const actionType = this.getActionType(input)

    // 1. Verifier les limites journalieres
    const limitOK = await this.checkDailyLimit(actionType)
    if (!limitOK) {
      // Reporter a demain
      const tomorrowMs = this.getNextBusinessDayMs()
      await this.reschedule(input, tomorrowMs)
      return { success: false, action_type: actionType, waalaxy_campaign_id: null, sent_at: '', delay_applied_ms: 0 }
    }

    // 2. Verifier sante du compte LinkedIn
    const accountHealth = await this.checkAccountHealth()
    if (accountHealth.restricted) {
      await this.handleRestriction(accountHealth)
      throw new Error('LINKEDIN_RESTRICTED: compte en restriction')
    }

    // 3. Appliquer un delai randomise (120-300 secondes)
    const randomDelay = Math.floor(Math.random() * (300 - 120 + 1) + 120) * 1000
    await this.sleep(randomDelay)

    // 4. Executer l'action
    try {
      let result: LinkedInActionResult

      switch (actionType) {
        case 'connection_request':
          result = await this.sendConnectionRequest(input, randomDelay)
          break
        case 'message':
          result = await this.sendMessage(input, randomDelay)
          break
        case 'profile_visit':
          result = await this.visitProfile(input, randomDelay)
          break
        default:
          throw new Error(`Action LinkedIn inconnue: ${actionType}`)
      }

      // 5. Logger
      await this.logAction(input, result)

      // 6. Incrementer compteur
      await this.incrementDailyCounter(actionType)

      // 7. Planifier prochaine etape
      await this.scheduleNextLinkedInStep(input)

      return result
    } catch (error: any) {
      await this.handleLinkedInError(input, error)
      throw error
    }
  }

  private async sendConnectionRequest(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    if (!input.linkedin_message?.connection_note) {
      throw new Error('connection_note manquant dans linkedin_message')
    }

    // Verifier que la note ne depasse pas 300 caracteres
    const note = input.linkedin_message.connection_note.content
    if (note.length > 300) {
      throw new Error(`Connection note trop longue: ${note.length}/300 caracteres`)
    }

    // Via Waalaxy webhook/API
    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'send_connection',
        linkedin_url: input.prospect.linkedin_url,
        note: note,
        tags: [
          `axiom-${input.scoring.categorie.toLowerCase()}`,
          `seq-${input.sequence.sequence_id}`,
          `step-${input.sequence.etape_actuelle}`,
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${input.message_id}_linkedin_conn`,
        },
      }
    )

    return {
      success: true,
      action_type: 'connection_request',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private async sendMessage(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    if (!input.linkedin_message?.post_connection_message) {
      throw new Error('post_connection_message manquant')
    }

    // Verifier que le prospect est deja connecte (1st degree)
    const isConnected = await this.checkConnectionStatus(input.prospect.linkedin_url!)

    if (!isConnected) {
      // Pas connecte : envoyer d'abord une demande de connexion
      console.warn(`[Agent5b] Prospect ${input.prospect_id} pas connecte, envoi connection request d'abord`)
      return await this.sendConnectionRequest(input, delayApplied)
    }

    const message = input.linkedin_message.post_connection_message.content

    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'send_message',
        linkedin_url: input.prospect.linkedin_url,
        message: message,
        tags: [
          `axiom-${input.scoring.categorie.toLowerCase()}`,
          `step-${input.sequence.etape_actuelle}`,
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${input.message_id}_linkedin_msg`,
        },
      }
    )

    return {
      success: true,
      action_type: 'message',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private async visitProfile(
    input: SuiveurInput,
    delayApplied: number
  ): Promise<LinkedInActionResult> {
    const response = await axios.post(
      `${this.waalaxyBaseUrl}/campaigns/actions`,
      {
        action: 'visit_profile',
        linkedin_url: input.prospect.linkedin_url,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WAALAXY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return {
      success: true,
      action_type: 'profile_visit',
      waalaxy_campaign_id: response.data.campaign_id,
      sent_at: new Date().toISOString(),
      delay_applied_ms: delayApplied,
    }
  }

  private getActionType(input: SuiveurInput): 'connection_request' | 'message' | 'profile_visit' {
    switch (input.message.canal) {
      case 'linkedin_connection': return 'connection_request'
      case 'linkedin_message': return 'message'
      case 'linkedin_inmail': return 'message'
      default: return 'profile_visit'
    }
  }

  private async checkDailyLimit(actionType: string): Promise<boolean> {
    const count = await db.query(
      `SELECT COUNT(*) as count FROM linkedin_actions
       WHERE action_type = $1 AND created_at >= CURRENT_DATE`,
      [actionType]
    )
    const limit = this.dailyLimits[actionType as keyof typeof this.dailyLimits] || 20
    return count.rows[0].count < limit
  }

  private async checkAccountHealth(): Promise<{
    restricted: boolean
    restrictionType: string | null
    recoveryDays: number | null
  }> {
    // Verifier les signes de restriction
    const recentActions = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
        COUNT(*) FILTER (WHERE status = 'RATE_LIMITED') as rate_limited_count,
        COUNT(*) as total_count
      FROM linkedin_actions
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `)

    const failRate = recentActions.rows[0].failed_count / Math.max(recentActions.rows[0].total_count, 1)
    const rateLimitedCount = recentActions.rows[0].rate_limited_count

    if (rateLimitedCount > 3) {
      return { restricted: true, restrictionType: 'RATE_LIMITED', recoveryDays: 3 }
    }
    if (failRate > 0.3) {
      return { restricted: true, restrictionType: 'HIGH_FAIL_RATE', recoveryDays: 7 }
    }

    return { restricted: false, restrictionType: null, recoveryDays: null }
  }

  private async handleRestriction(health: { restrictionType: string | null; recoveryDays: number | null }): Promise<void> {
    // 1. Arreter TOUTE automation LinkedIn
    await db.query(`
      UPDATE linkedin_actions SET status = 'PAUSED_RESTRICTION'
      WHERE status = 'PENDING' AND created_at >= CURRENT_DATE
    `)

    // 2. Notifier Jonathan
    await notifySlack({
      channel: '#sales-alerts',
      text: `ALERTE LINKEDIN: Restriction detectee (${health.restrictionType}). Toute automation LinkedIn est en pause pour ${health.recoveryDays} jours.`,
      priority: 'HIGH',
    })

    // 3. Logger
    await db.query(`
      INSERT INTO linkedin_restrictions (
        restriction_type, detected_at, recovery_days, status
      ) VALUES ($1, NOW(), $2, 'ACTIVE')
    `, [health.restrictionType, health.recoveryDays])
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

#### 3b.3 Likes/comments automatiques (engagement pre-contact)

```typescript
class LinkedInEngagement {
  // Avant d'envoyer une demande de connexion, engager avec le contenu du prospect
  async preContactEngagement(input: SuiveurInput): Promise<void> {
    const linkedinUrl = input.prospect.linkedin_url
    if (!linkedinUrl) return

    // Jour J-2 : Visiter le profil
    await this.scheduleAction({
      action: 'visit_profile',
      linkedin_url: linkedinUrl,
      delay_days: -2,
      prospect_id: input.prospect_id,
    })

    // Jour J-1 : Liker un post recent (si existe)
    await this.scheduleAction({
      action: 'like_recent_post',
      linkedin_url: linkedinUrl,
      delay_days: -1,
      prospect_id: input.prospect_id,
    })

    // Jour J : Envoyer la demande de connexion (geree par le flow principal)
  }

  private async scheduleAction(params: {
    action: string
    linkedin_url: string
    delay_days: number
    prospect_id: string
  }): Promise<void> {
    const delayMs = Math.max(0, params.delay_days * 24 * 60 * 60 * 1000)

    await linkedinQueue.add(
      `engagement-${params.prospect_id}-${params.action}`,
      params,
      {
        delay: delayMs,
        priority: 8, // Basse priorite (engagement < envoi)
      }
    )
  }
}
```

#### 3b.4 Volumes et limites LinkedIn

| Action | Limite safe/jour | Limite max/semaine | Intervalle min entre actions |
|---|---|---|---|
| Demandes de connexion | 25 | 100-150 | 120-300 secondes (randomise) |
| Messages (1st degree) | 80 | 400 | 120-300 secondes |
| Visites de profil | 150 | 750 | 60-120 secondes |
| Likes | 40 | 200 | 30-60 secondes |
| Comments | 15 | 75 | 300-600 secondes |

**Regle critique : jamais de pattern parfait.** Tous les delais sont randomises. Pas d'activite le weekend. Heures variables entre 8h et 18h.

#### 3b.5 Detection de ban LinkedIn

```typescript
const LINKEDIN_BAN_SIGNALS = {
  tier1_warning: [
    'pending_connections_stalling',      // Acceptance rate chute sous 20%
    'message_delivery_delayed',          // Messages non distribues
    'profile_views_reset',               // Compteur remis a zero
  ],
  tier2_temp_ban: [
    'too_many_requests_message',         // "You've sent too many requests"
    'account_locked',                    // Compte verrouille 3-14 jours
    'id_verification_required',          // Verification identite requise
  ],
  tier3_permanent_ban: [
    'account_disabled',                  // Compte desactive
    'appeal_rejected',                   // Appel refuse
  ],
}

// Processus de recovery
const LINKEDIN_RECOVERY_PLAN = {
  immediate: {
    actions: ['STOP_ALL_AUTOMATION'],
    duration_hours: 48,
  },
  warmup: {
    actions: ['MANUAL_ONLY', 'LIKES_COMMENTS_ONLY'],
    volume: { max_actions_per_day: 10 },
    duration_days: 7,
  },
  gradual_resume: {
    actions: ['CONNECTIONS_5_PER_DAY', 'MESSAGES_10_PER_DAY'],
    duration_days: 7,
  },
  full_resume: {
    actions: ['INCREASE_50_PCT', 'THEN_75_PCT', 'THEN_NORMAL'],
    milestones: [15, 22, 30], // jours
  },
}
```

#### 3b.6 Couts LinkedIn

| Poste | Cout mensuel | Notes |
|---|---|---|
| Waalaxy Pro | 19 EUR/mois | 300+ invitations, auto-messages |
| LinkedIn Sales Navigator (optionnel) | 79 EUR/mois | InMails, filtres avances |
| Expandi (alternative) | 99 EUR/mois | Cloud-based, IPs dediees |

