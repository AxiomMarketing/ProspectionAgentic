declare module 'wappalyzer-core' {
  interface Technology {
    name: string;
    slug?: string;
    categories?: Array<{ name: string }>;
    version?: string;
  }

  interface AnalyzeResult {
    technologies: Technology[];
  }

  interface AnalyzeInput {
    url?: string;
    html?: string;
    headers?: Record<string, string>;
    scriptSrc?: string[];
  }

  const Wappalyzer: {
    setTechnologies(techs: Record<string, unknown>): void;
    analyze(input: AnalyzeInput): Promise<AnalyzeResult>;
  };

  export = Wappalyzer;
}
