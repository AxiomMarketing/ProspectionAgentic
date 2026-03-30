import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailPatternService {
  private readonly patternTemplates = [
    '{first}.{last}',   // jean.dupont@
    '{first}',          // jean@
    '{f}{last}',        // jdupont@
    '{first}{last}',    // jeandupont@
    '{f}.{last}',       // j.dupont@
    '{last}.{first}',   // dupont.jean@
    '{first}-{last}',   // jean-dupont@
    '{first}_{last}',   // jean_dupont@
    '{last}',           // dupont@
    '{first}.{l}',      // jean.d@
    '{f}{l}',           // jd@
    '{last}{first}',    // dupontjean@
    '{first}.{last}1',  // jean.dupont1@
    '{f}.{l}',          // j.d@
    '{last}{f}',        // dupontj@
  ];

  generateCandidates(firstName: string, lastName: string, domain: string, employeeCount?: number): string[] {
    const f = this.normalize(firstName);
    const l = this.normalize(lastName);

    const patterns = this.prioritizeByCompanySize([...this.patternTemplates], employeeCount);

    return patterns.map((template) =>
      this.applyTemplate(template, f, l) + '@' + domain,
    );
  }

  prioritizeByCompanySize(patterns: string[], employeeCount?: number): string[] {
    if (!employeeCount) return patterns;

    if (employeeCount < 50) {
      // PME: prenom@ dominant at 70%
      const idx = patterns.indexOf('{first}');
      if (idx > 0) {
        patterns.splice(idx, 1);
        patterns.unshift('{first}');
      }
    }

    if (employeeCount > 1000) {
      // Large: prenom.nom@ dominant at 48%
      // '{first}.{last}' stays at position 0 (already default)
    }

    return patterns;
  }

  normalize(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/['ʼ''`]/g, '')         // Remove apostrophes (multiple Unicode variants)
      .replace(/[\s-]/g, '')           // Merge spaces and hyphens
      .replace(/[^a-z]/g, '');         // Keep only a-z
  }

  private applyTemplate(template: string, first: string, last: string): string {
    return template
      .replace('{first}', first)
      .replace('{last}', last)
      .replace('{f}', first[0] ?? '')
      .replace('{l}', last[0] ?? '');
  }
}
