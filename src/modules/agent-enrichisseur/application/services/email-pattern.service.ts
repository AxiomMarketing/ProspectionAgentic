import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailPatternService {
  private readonly patterns = [
    (f: string, l: string) => `${f}.${l}`,
    (f: string, l: string) => `${f[0]}.${l}`,
    (f: string, _l: string) => `${f}`,
    (_f: string, l: string) => `${l}`,
    (f: string, l: string) => `${f}${l}`,
    (f: string, l: string) => `${f[0]}${l}`,
    (f: string, l: string) => `${f}-${l}`,
    (f: string, l: string) => `${f}_${l}`,
    (f: string, l: string) => `${l}.${f}`,
    (f: string, l: string) => `${l}.${f[0]}`,
  ];

  generateCandidates(firstName: string, lastName: string, domain: string): string[] {
    const f = this.normalize(firstName);
    const l = this.normalize(lastName);
    return this.patterns.map((p) => `${p(f, l)}@${domain}`);
  }

  private normalize(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
  }
}
