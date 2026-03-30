export interface LegalNotice {
  id: string;
  type: 'creation' | 'modification' | 'procedure_collective' | 'cession' | 'radiation';
  publicationDate: Date;
  tribunal: string;
  content: string;
  registre: string;
  denomination?: string;
}

export abstract class ILegalNoticesAdapter {
  abstract getNoticesBySiren(siren: string): Promise<LegalNotice[]>;
  abstract getRecentCreations(since: Date, departement?: string): Promise<LegalNotice[]>;
  abstract hasCollectiveProcedure(siren: string): Promise<boolean>;
  abstract isAvailable(): Promise<boolean>;
}
