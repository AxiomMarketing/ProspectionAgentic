import { Injectable } from '@nestjs/common';
import { HunterContact } from '../adapters/hunter.adapter';

interface DecideurMappingEntry {
  regex: RegExp;
  points: number;
}

const DECIDEUR_MAPPINGS: Record<string, DecideurMappingEntry[]> = {
  pme_metro: [
    { regex: /cmo|directeur\s+marketing/i, points: 10 },
    { regex: /dg|ceo|directeur\s+g[eé]n[eé]ral/i, points: 8 },
    { regex: /cto|dsi|directeur\s+(?:des\s+)?syst[eè]mes/i, points: 6 },
  ],
  ecommerce: [
    { regex: /fondateur|founder/i, points: 10 },
    { regex: /head\s+of\s+growth/i, points: 8 },
    { regex: /cmo/i, points: 6 },
  ],
  collectivite: [
    { regex: /dgs|directeur\s+g[eé]n[eé]ral\s+des\s+services/i, points: 10 },
    { regex: /dsi|directeur\s+(?:des\s+)?syst[eè]mes/i, points: 8 },
    { regex: /[eé]lu\s+num[eé]rique|vice-pr[eé]sident\s+num[eé]rique/i, points: 6 },
  ],
  startup: [
    { regex: /founder|ceo/i, points: 10 },
    { regex: /cto/i, points: 8 },
    { regex: /head\s+of\s+growth/i, points: 6 },
  ],
  agence_wl: [
    { regex: /fondateur/i, points: 10 },
    { regex: /ceo|directeur/i, points: 8 },
    { regex: /account\s+manager/i, points: 6 },
  ],
};

const SEGMENT_DEPARTMENT_MAP: Record<string, string> = {
  pme_metro: 'marketing',
  ecommerce: 'executive',
  collectivite: 'it',
  startup: 'executive',
  agence_wl: 'sales',
};

export interface DecideurRanking {
  primary: HunterContact & { decideur_score: number };
  secondaires: Array<HunterContact & { decideur_score: number }>;
}

@Injectable()
export class DecideurSelectionService {
  calculateDecideurScore(title: string, segment: string): number {
    const mappings = DECIDEUR_MAPPINGS[segment];
    if (!mappings || !title) return 2;

    for (const entry of mappings) {
      if (entry.regex.test(title)) {
        return entry.points;
      }
    }
    return 2;
  }

  selectBestDecideur(contacts: HunterContact[], segment: string): DecideurRanking | null {
    if (!contacts.length) return null;

    const scored = contacts
      .map(c => ({
        ...c,
        decideur_score: this.calculateDecideurScore(c.position ?? '', segment),
      }))
      .sort((a, b) => b.decideur_score - a.decideur_score);

    const [primary, ...rest] = scored;
    return {
      primary,
      secondaires: rest.slice(0, 3),
    };
  }

  getDepartmentForSegment(segment: string): string {
    return SEGMENT_DEPARTMENT_MAP[segment] ?? 'executive';
  }
}
