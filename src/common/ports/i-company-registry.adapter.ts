export interface CompanyDirector {
  firstName: string;
  lastName: string;
  role: string;
  birthDate?: string;
  nationality?: string;
}

export interface CompanyFinancials {
  year: number;
  revenue?: number;
  netIncome?: number;
  totalAssets?: number;
  employeeCount?: number;
}

export interface CompanyRegistryData {
  siren: string;
  directors: CompanyDirector[];
  beneficialOwners: CompanyDirector[];
  financials: CompanyFinancials[];
  legalForm: string;
  capital?: number;
  registrationDate: Date;
}

export abstract class ICompanyRegistryAdapter {
  abstract getBySiren(siren: string): Promise<CompanyRegistryData | null>;
  abstract getDirectors(siren: string): Promise<CompanyDirector[]>;
  abstract getFinancials(siren: string): Promise<CompanyFinancials[]>;
  abstract isAvailable(): Promise<boolean>;
}
