import { Injectable, Logger } from '@nestjs/common';

interface DeduplicableRecord {
  companyName?: string;
  companySiren?: string;
  companyWebsite?: string;
  companyLinkedinUrl?: string;
  source: string;
  signals?: unknown[];
  preScore?: number;
}

interface DeduplicatedResult<T extends DeduplicableRecord> {
  record: T;
  sourceCount: number;
  mergedSources: string[];
  mergedSignals: unknown[];
  multiSourceBonus: number;
}

@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  /**
   * Deduplicate records by priority:
   * 1. SIREN/SIRET match
   * 2. Domain web (normalized)
   * 3. LinkedIn URL
   * 4. Company name (Levenshtein distance < threshold)
   */
  deduplicate<T extends DeduplicableRecord>(
    records: T[],
    levenshteinThreshold = 3,
  ): DeduplicatedResult<T>[] {
    const groups = new Map<string, { primary: T; sources: Set<string>; signals: unknown[] }>();

    for (const record of records) {
      const key = this.findMatchKey(record, groups, levenshteinThreshold);

      if (key) {
        const group = groups.get(key)!;
        group.sources.add(record.source);
        if (record.signals) {
          group.signals.push(...record.signals);
        }
        // Keep the record with the highest preScore as primary
        if ((record.preScore ?? 0) > (group.primary.preScore ?? 0)) {
          group.primary = record;
        }
      } else {
        const newKey = this.generateKey(record);
        groups.set(newKey, {
          primary: record,
          sources: new Set([record.source]),
          signals: record.signals ? [...record.signals] : [],
        });
      }
    }

    const results: DeduplicatedResult<T>[] = [];
    for (const group of groups.values()) {
      const sourceCount = group.sources.size;
      const multiSourceBonus = sourceCount >= 3 ? 15 : sourceCount >= 2 ? 10 : 0;

      results.push({
        record: group.primary,
        sourceCount,
        mergedSources: [...group.sources],
        mergedSignals: group.signals,
        multiSourceBonus,
      });
    }

    this.logger.log({
      msg: 'Deduplication complete',
      inputCount: records.length,
      outputCount: results.length,
      deduplicationRate: records.length > 0
        ? Math.round(((records.length - results.length) / records.length) * 100)
        : 0,
    });

    return results;
  }

  private findMatchKey<T extends DeduplicableRecord>(
    record: T,
    groups: Map<string, { primary: T; sources: Set<string>; signals: unknown[] }>,
    threshold: number,
  ): string | null {
    // Priority 1: SIREN match
    if (record.companySiren) {
      for (const [key, group] of groups) {
        if (group.primary.companySiren === record.companySiren) return key;
      }
    }

    // Priority 2: Domain match (normalized)
    const domain = this.normalizeDomain(record.companyWebsite);
    if (domain) {
      for (const [key, group] of groups) {
        if (this.normalizeDomain(group.primary.companyWebsite) === domain) return key;
      }
    }

    // Priority 3: LinkedIn URL match
    if (record.companyLinkedinUrl) {
      for (const [key, group] of groups) {
        if (group.primary.companyLinkedinUrl === record.companyLinkedinUrl) return key;
      }
    }

    // Priority 4: Levenshtein name match
    if (record.companyName) {
      const normalizedName = this.normalizeName(record.companyName);
      for (const [key, group] of groups) {
        if (group.primary.companyName) {
          const groupName = this.normalizeName(group.primary.companyName);
          if (this.levenshteinDistance(normalizedName, groupName) <= threshold) return key;
        }
      }
    }

    return null;
  }

  private generateKey(record: DeduplicableRecord): string {
    return record.companySiren
      ?? this.normalizeDomain(record.companyWebsite)
      ?? record.companyLinkedinUrl
      ?? record.companyName
      ?? crypto.randomUUID();
  }

  private normalizeDomain(url?: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-zàâäéèêëïîôùûüÿçœæ0-9\s]/g, '')
      .replace(/\b(sas|sarl|sa|sasu|eurl|sci|snc|eirl)\b/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[b.length][a.length];
  }
}
