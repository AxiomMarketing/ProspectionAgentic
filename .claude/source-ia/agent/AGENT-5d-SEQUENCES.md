# SOUS-AGENT 5d — ORCHESTRATEUR DE SEQUENCES
**Agent parent** : AGENT-5-MASTER.md
**Mission** : Planifier et orchestrer les etapes des sequences multicanales

---

### 3d. ORCHESTRATEUR DE SEQUENCES

#### 3d.1 Architecture technique

```
Prospect entre dans le pipeline
    |
    v
+-------------------------------------------+
| SOUS-AGENT 5d : ORCHESTRATEUR SEQUENCES  |
| 1. Attribuer la sequence appropriee       |
| 2. Planifier chaque etape (jour/heure)    |
| 3. Appliquer "widening gap"               |
| 4. Gerer timezone (Reunion vs metro)      |
| 5. Respecter jours feries/weekends        |
| 6. Prioriser HOT > WARM > COLD           |
| 7. Arreter si reponse detectee            |
+-------------------------------------------+
    |
    v
Jobs BullMQ planifies pour chaque etape
```

#### 3d.2 Logique "Widening Gap" (espacement progressif)

```typescript
class SequenceOrchestrator {
  // Espacement entre les etapes : de plus en plus large
  // Etape 1 -> 2 : 2-3 jours
  // Etape 2 -> 3 : 4-5 jours
  // Etape 3 -> 4 : 7-10 jours
  // Etape 4+ : 10-14 jours

  private readonly WIDENING_GAP_DAYS: Record<string, number[]> = {
    // Pour HOT : sequence intensive, gaps courts
    'HOT': [0, 2, 5, 10],
    // Pour WARM : sequence standard
    'WARM': [0, 3, 7, 14, 21],
    // Pour COLD : sequence longue et espacee
    'COLD': [0, 3, 7, 14, 21, 30, 45],
  }

  async initializeSequence(input: SuiveurInput): Promise<void> {
    const categorie = input.scoring.categorie
    const gaps = this.WIDENING_GAP_DAYS[categorie] || this.WIDENING_GAP_DAYS['WARM']

    // Creer l'entree de sequence en base
    const sequenceRecord = await db.query(`
      INSERT INTO prospect_sequences (
        prospect_id, sequence_id, categorie, segment,
        total_steps, current_step, status,
        gaps_days, started_at
      ) VALUES ($1, $2, $3, $4, $5, 1, 'ACTIVE', $6, NOW())
      RETURNING id
    `, [
      input.prospect_id, input.sequence.sequence_id,
      categorie, input.scoring.segment,
      gaps.length, JSON.stringify(gaps),
    ])

    // Planifier toutes les etapes d'avance
    for (let step = 0; step < gaps.length; step++) {
      const dayOffset = gaps[step]
      const sendTime = await this.calculateSendTime(input, dayOffset)

      await suiveurQueue.add(
        `seq-${input.prospect_id}-step-${step + 1}`,
        {
          type: 'SEND_STEP',
          prospect_id: input.prospect_id,
          sequence_id: input.sequence.sequence_id,
          step_number: step + 1,
          total_steps: gaps.length,
          scheduled_for: sendTime.toISOString(),
        },
        {
          delay: sendTime.getTime() - Date.now(),
          priority: this.getPriority(categorie),
          jobId: `seq-${input.prospect_id}-step-${step + 1}`, // Pour pouvoir annuler
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )
    }
  }

  private getPriority(categorie: string): number {
    switch (categorie) {
      case 'HOT': return 1    // Priorite la plus haute
      case 'WARM': return 5
      case 'COLD': return 10
      default: return 10
    }
  }

  async calculateSendTime(input: SuiveurInput, dayOffset: number): Promise<Date> {
    const moment = require('moment-timezone')

    // Determiner la timezone du prospect
    const prospectTimezone = await this.getProspectTimezone(input)

    // Horaire optimal d'envoi (mardi-jeudi 8h-10h)
    const optimalHours = this.getOptimalSendHour(input.message.canal)

    // Partir de maintenant + dayOffset
    let sendTime = moment.tz(prospectTimezone).add(dayOffset, 'days')

    // Fixer l'heure optimale
    sendTime.set({
      hour: optimalHours.hour,
      minute: optimalHours.minute + Math.floor(Math.random() * 20), // +0-20min aleatoire
      second: Math.floor(Math.random() * 60),
    })

    // Ajuster si weekend ou jour ferie
    sendTime = await this.skipToNextBusinessDay(sendTime, prospectTimezone)

    // Si l'heure est deja passee, reporter au prochain jour ouvre
    if (sendTime.isBefore(moment())) {
      sendTime.add(1, 'day')
      sendTime = await this.skipToNextBusinessDay(sendTime, prospectTimezone)
    }

    return sendTime.toDate()
  }

  private getOptimalSendHour(canal: string): { hour: number; minute: number } {
    switch (canal) {
      case 'email':
        // Email : mardi-jeudi 8h-10h, pic a 9h
        return { hour: 8 + Math.floor(Math.random() * 2), minute: Math.floor(Math.random() * 30) }
      case 'linkedin_connection':
      case 'linkedin_message':
        // LinkedIn : 9h-11h
        return { hour: 9 + Math.floor(Math.random() * 2), minute: Math.floor(Math.random() * 30) }
      default:
        return { hour: 9, minute: 0 }
    }
  }

  private async getProspectTimezone(input: SuiveurInput): Promise<string> {
    // Si le prospect a une timezone enregistree, l'utiliser
    const prospect = await db.query(
      `SELECT timezone FROM prospects WHERE prospect_id = $1`,
      [input.prospect_id]
    )

    if (prospect.rows[0]?.timezone) {
      return prospect.rows[0].timezone
    }

    // Defaut : France metropolitaine
    return 'Europe/Paris'
  }

  private async skipToNextBusinessDay(
    momentDate: any,
    timezone: string
  ): Promise<any> {
    const holidays = await this.getHolidays(momentDate.year())

    while (true) {
      const dayOfWeek = momentDate.day()
      const dateStr = momentDate.format('YYYY-MM-DD')

      // Pas de weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        momentDate.add(1, 'day')
        continue
      }

      // Pas de jour ferie
      if (holidays.includes(dateStr)) {
        momentDate.add(1, 'day')
        continue
      }

      break
    }

    return momentDate
  }

  private async getHolidays(year: number): Promise<string[]> {
    // Jours feries France metropolitaine
    const fixedHolidays = [
      `${year}-01-01`, // Jour de l'an
      `${year}-05-01`, // Fete du travail
      `${year}-05-08`, // Victoire 1945
      `${year}-07-14`, // Fete nationale
      `${year}-08-15`, // Assomption
      `${year}-11-01`, // Toussaint
      `${year}-11-11`, // Armistice
      `${year}-12-25`, // Noel
    ]

    // Jours feries mobiles (Paques et derives) -- calcul pour 2026
    const easterDates: Record<number, string> = {
      2025: '2025-04-20',
      2026: '2026-04-05',
      2027: '2027-03-28',
      2028: '2028-04-16',
    }

    const easter = easterDates[year]
    if (easter) {
      const easterMoment = require('moment')(easter)
      fixedHolidays.push(
        easterMoment.clone().add(1, 'day').format('YYYY-MM-DD'),  // Lundi de Paques
        easterMoment.clone().add(39, 'days').format('YYYY-MM-DD'), // Ascension
        easterMoment.clone().add(50, 'days').format('YYYY-MM-DD'), // Lundi de Pentecote
      )
    }

    // Jours feries specifiques La Reunion (pour Jonathan)
    const reunionHolidays = [
      `${year}-12-20`, // Abolition de l'esclavage a La Reunion
    ]

    return [...fixedHolidays, ...reunionHolidays]
  }
}
```

#### 3d.3 Gestion timezone La Reunion vs France metro

```typescript
// Jonathan est a La Reunion (UTC+4)
// Prospects principalement en France metro (UTC+1 hiver / UTC+2 ete)
// Decalage : +3h en hiver, +2h en ete

const TIMEZONE_CONFIG = {
  // Base Axiom
  base: 'Indian/Reunion',       // UTC+4 (pas de changement d'heure)

  // Cibles principales
  targets: {
    france_metro: 'Europe/Paris',  // UTC+1 (hiver) / UTC+2 (ete)
    belgique: 'Europe/Brussels',   // UTC+1 / UTC+2
    suisse: 'Europe/Zurich',       // UTC+1 / UTC+2
    luxembourg: 'Europe/Luxembourg', // UTC+1 / UTC+2
    canada_quebec: 'America/Montreal', // UTC-5 / UTC-4
  },

  // Implications operationnelles
  implications: {
    // Quand il est 9h a Paris, il est :
    // - 12h a La Reunion (hiver) ou 11h (ete)
    // Donc Jonathan peut travailler ses matins tranquillement
    // et les emails partent automatiquement a 9h heure prospect

    // Fenetre d'envoi France metro (en heure Reunion) :
    envoi_france_winter: { start_reunion: 12, end_reunion: 15 }, // 9h-12h Paris
    envoi_france_summer: { start_reunion: 11, end_reunion: 14 }, // 9h-12h Paris

    // Notifications de reponses HOT :
    // Si un prospect francais repond a 9h Paris = 12h Reunion
    // Jonathan recoit la notif dans ses heures de travail
    // Si reponse a 17h Paris = 20h Reunion --> notification Slack quand meme
  },
}

// Fonction utilitaire pour calculer l'heure d'envoi dans la timezone du prospect
function getLocalSendTime(
  prospectTimezone: string,
  targetHour: number,
  targetMinute: number = 0
): Date {
  const moment = require('moment-timezone')

  const now = moment.tz(prospectTimezone)
  let sendTime = now.clone().set({ hour: targetHour, minute: targetMinute, second: 0 })

  // Si l'heure est passee aujourd'hui, programmer pour demain
  if (sendTime.isBefore(now)) {
    sendTime.add(1, 'day')
  }

  return sendTime.toDate()
}
```


---

## 5. SCHEDULING

### 5.1 Meilleurs horaires par canal (donnees 2025-2026)

#### Email

| Horaire (heure locale prospect) | Open Rate | Reply Rate | Recommandation |
|---|---|---|---|
| 8h00 - 10h00 | 27-28% | 60.58% des reponses | **OPTIMAL** |
| 10h00 - 12h00 | 24-26% | Bon | Acceptable |
| 14h00 - 16h00 | 20-22% | Moyen | Eviter si possible |
| Avant 8h / Apres 18h | < 15% | Faible | Interdit |

**Meilleurs jours :**
1. **Mardi** (27-28% open rate) -- meilleur jour
2. **Jeudi** (25-26%) -- deuxieme meilleur
3. **Mercredi** (17-18%) -- acceptable
4. **Lundi** -- eviter (congestion inbox)
5. **Vendredi** -- eviter (attention basse)
6. **Weekend** -- INTERDIT

#### LinkedIn

| Horaire (heure locale prospect) | Engagement | Recommandation |
|---|---|---|
| 9h00 - 11h00 | Haut | **OPTIMAL** |
| 11h00 - 13h00 | Moyen-haut | Acceptable |
| 14h00 - 16h00 | Moyen | Acceptable pour likes |
| Weekend | Tres faible | INTERDIT |

**Regle critique LinkedIn :** Ne pas envoyer de batch a heure fixe. LinkedIn detecte les patterns reguliers. Toujours randomiser +/- 2h autour de l'horaire cible.

### 5.2 Gestion timezone La Reunion vs France metro

```typescript
const TIMEZONE_RULES = {
  // Decalage La Reunion (UTC+4) vs Paris (UTC+1/+2)
  // Hiver : +3h (quand Paris = 9h, Reunion = 12h)
  // Ete : +2h (quand Paris = 9h, Reunion = 11h)

  planning: {
    // Jonathan peut programmer les envois depuis La Reunion
    // Le systeme envoie automatiquement a l'heure du prospect
    // Exemple : job planifie pour 9h Europe/Paris
    // Le serveur execute a 9h heure Paris, que Jonathan soit eveille ou non

    // Fenetre de notification pour Jonathan (heure Reunion) :
    jonathan_working_hours: {
      start: 8,  // 8h Reunion = 5h Paris (hiver) / 6h Paris (ete)
      end: 20,   // 20h Reunion = 17h Paris (hiver) / 18h Paris (ete)
    },

    // Notification HOT lead : toujours immediate, meme hors heures
    hot_lead_notification: 'always_immediate',
  },
}
```

### 5.3 Throttling

| Canal | Max/heure | Max/jour | Priorite |
|---|---|---|---|
| Email (par adresse) | 10 | 50 | HOT > WARM > COLD |
| Email (total 3 domaines) | 30 | 150 | -- |
| LinkedIn connexions | 5 | 25 | HOT > WARM |
| LinkedIn messages | 15 | 80 | HOT > WARM |
| LinkedIn visites | 30 | 150 | Egalitaire |

#### Priorisation HOT > WARM dans la file d'attente

```typescript
// BullMQ priority : plus le nombre est petit, plus c'est prioritaire
const QUEUE_PRIORITIES = {
  HOT_A: 1,   // Priorite absolue
  HOT_B: 2,
  HOT_C: 3,
  WARM: 5,
  COLD: 10,
}

// Si la file est pleine (quota journalier atteint), les HOT passent d'abord
// Les COLD sont reportes au jour suivant si necessaire
```

### 5.4 Calendrier jours feries France + DOM 2026

```typescript
const JOURS_FERIES_2026: Record<string, string[]> = {
  // France metropolitaine
  france_metro: [
    '2026-01-01',  // Jour de l'an
    '2026-04-06',  // Lundi de Paques
    '2026-05-01',  // Fete du travail
    '2026-05-08',  // Victoire 1945
    '2026-05-14',  // Ascension
    '2026-05-25',  // Lundi de Pentecote
    '2026-07-14',  // Fete nationale
    '2026-08-15',  // Assomption
    '2026-11-01',  // Toussaint
    '2026-11-11',  // Armistice
    '2026-12-25',  // Noel
  ],

  // La Reunion (jours feries supplementaires)
  reunion: [
    // Memes que metro +
    '2026-12-20',  // Abolition de l'esclavage a La Reunion
  ],

  // Periodes a eviter (pas feries mais basse reactivite)
  periodes_creuses: [
    // Vacances de Noel/Nouvel An
    { debut: '2026-12-22', fin: '2027-01-03' },
    // Vacances d'ete
    { debut: '2026-07-15', fin: '2026-08-31' },
    // Pont de l'Ascension
    { debut: '2026-05-13', fin: '2026-05-17' },
  ],
}

// Regle : pas d'envoi les jours feries du pays du prospect
// Regle : reduire le volume de 50% pendant les periodes creuses
```

### 5.5 Weekend : pas d'envoi

```typescript
function isWeekend(date: Date, timezone: string): boolean {
  const moment = require('moment-timezone')
  const m = moment.tz(date, timezone)
  return m.day() === 0 || m.day() === 6 // Dimanche = 0, Samedi = 6
}

// Regle absolue : aucun envoi email ou LinkedIn le weekend
// Les jobs planifies un weekend sont automatiquement decales au lundi suivant
```

---
