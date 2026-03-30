import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApifyClient } from 'apify-client';

export interface JobPosting {
  companyName: string;
  jobTitle: string;
  platform: 'linkedin' | 'wttj' | 'hellowork' | 'indeed';
  url: string;
  location?: string;
  salary?: string;
  publishedAt: Date;
  rawData: Record<string, unknown>;
}

export interface DetectedSignal {
  companyName: string;
  signalType: string;
  score: number;
  reason: string;
  postings: JobPosting[];
}

interface HasDataJob {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  date?: string;
  description?: string;
  [key: string]: unknown;
}

interface ApifyLinkedInItem {
  title?: string;
  companyName?: string;
  location?: string;
  salary?: string;
  jobUrl?: string;
  postedAt?: string;
  [key: string]: unknown;
}

interface ApifyWttjItem {
  name?: string;
  company?: { name?: string };
  office?: { city?: string };
  salary?: { min?: number; max?: number };
  url?: string;
  published_at?: string;
  [key: string]: unknown;
}

interface ApifyHelloworkItem {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  date?: string;
  [key: string]: unknown;
}

@Injectable()
export class JobBoardScannerAdapter {
  private readonly logger = new Logger(JobBoardScannerAdapter.name);
  private readonly apifyToken: string | undefined;
  private readonly hasdataKey: string | undefined;
  private readonly hasdataBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apifyToken = this.configService.get<string>('APIFY_API_TOKEN');
    this.hasdataKey = this.configService.get<string>('HASDATA_API_KEY');
    this.hasdataBaseUrl =
      this.configService.get<string>('HASDATA_BASE_URL') ?? 'https://api.hasdata.com';
  }

  async searchJobs(keywords: string[], location?: string): Promise<JobPosting[]> {
    const query = keywords.join(' ');

    const [linkedInJobs, wttjJobs, helloworkJobs, indeedJobs] = await Promise.all([
      this.fetchLinkedIn(query, location),
      this.fetchWttj(query, location),
      this.fetchHellowork(query, location),
      this.fetchIndeed(query, location),
    ]);

    const all = [...linkedInJobs, ...wttjJobs, ...helloworkJobs, ...indeedJobs];
    return this.deduplicateByCompany(all);
  }

  detectSignals(postings: JobPosting[]): DetectedSignal[] {
    const byCompany = this.groupByCompany(postings);
    const signals: DetectedSignal[] = [];

    for (const [companyName, companyPostings] of Object.entries(byCompany)) {
      const companySignals = this.detectCompanySignals(companyName, companyPostings);
      signals.push(...companySignals);
    }

    return signals;
  }

  private detectCompanySignals(companyName: string, postings: JobPosting[]): DetectedSignal[] {
    const signals: DetectedSignal[] = [];
    const titlesAndDescs = postings
      .map((p) => `${p.jobTitle} ${(p.rawData['description'] as string) ?? ''}`.toLowerCase())
      .join(' ');

    if (/développeur web|react|frontend/i.test(titlesAndDescs)) {
      signals.push({
        companyName,
        signalType: 'budget_tech_disponible',
        score: 20,
        reason: 'Job posting contains web/frontend developer keywords',
        postings,
      });
    }

    if (/refonte|migration|nouveau site/i.test(titlesAndDescs)) {
      signals.push({
        companyName,
        signalType: 'besoin_externalisable',
        score: 28,
        reason: 'Job posting mentions refonte/migration/nouveau site',
        postings,
      });
    }

    if (postings.length >= 3) {
      signals.push({
        companyName,
        signalType: 'multi_offres',
        score: 10,
        reason: `Company has ${postings.length} simultaneous job postings`,
        postings,
      });
    }

    const titleText = postings.map((p) => p.jobTitle.toLowerCase()).join(' ');
    if (/premier recrutement|équipe à créer/i.test(titleText)) {
      signals.push({
        companyName,
        signalType: 'startup_debut',
        score: 20,
        reason: 'Job posting indicates first hire or team creation',
        postings,
      });
    }

    if (/\bcdd\b|freelance/i.test(titlesAndDescs)) {
      signals.push({
        companyName,
        signalType: 'mission_ponctuelle',
        score: 20,
        reason: 'Job posting is CDD or freelance (temporary mission)',
        postings,
      });
    }

    return signals;
  }

  private async fetchLinkedIn(query: string, location?: string): Promise<JobPosting[]> {
    if (!this.apifyToken) {
      this.logger.warn({ msg: 'APIFY_API_TOKEN not configured — skipping LinkedIn jobs fetch' });
      return [];
    }

    try {
      const client = new ApifyClient({ token: this.apifyToken });
      const run = await client.actor('curious_coder/linkedin-jobs-scraper').call({
        queries: query,
        location: location ?? 'France',
        maxResults: 50,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      return (items as ApifyLinkedInItem[]).map((item) => ({
        companyName: item.companyName ?? 'Unknown',
        jobTitle: item.title ?? '',
        platform: 'linkedin' as const,
        url: item.jobUrl ?? '',
        location: item.location,
        salary: item.salary,
        publishedAt: item.postedAt ? new Date(item.postedAt) : new Date(),
        rawData: item as Record<string, unknown>,
      }));
    } catch (error) {
      this.logger.error({
        msg: 'LinkedIn Apify actor failed',
        error: (error as Error).message,
      });
      return [];
    }
  }

  private async fetchWttj(query: string, location?: string): Promise<JobPosting[]> {
    if (!this.apifyToken) {
      this.logger.warn({ msg: 'APIFY_API_TOKEN not configured — skipping WTTJ jobs fetch' });
      return [];
    }

    try {
      const client = new ApifyClient({ token: this.apifyToken });
      const run = await client.actor('bebity/welcome-to-the-jungle-jobs-scraper').call({
        searchTerm: query,
        location: location ?? 'France',
        maxResults: 50,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      return (items as ApifyWttjItem[]).map((item) => {
        const salaryMin = item.salary?.min;
        const salaryMax = item.salary?.max;
        const salaryStr =
          salaryMin && salaryMax ? `${salaryMin}-${salaryMax}€` : salaryMin ? `${salaryMin}€` : undefined;

        return {
          companyName: item.company?.name ?? 'Unknown',
          jobTitle: item.name ?? '',
          platform: 'wttj' as const,
          url: item.url ?? '',
          location: item.office?.city,
          salary: salaryStr,
          publishedAt: item.published_at ? new Date(item.published_at) : new Date(),
          rawData: item as Record<string, unknown>,
        };
      });
    } catch (error) {
      this.logger.error({
        msg: 'WTTJ Apify actor failed',
        error: (error as Error).message,
      });
      return [];
    }
  }

  private async fetchHellowork(query: string, location?: string): Promise<JobPosting[]> {
    if (!this.apifyToken) {
      this.logger.warn({ msg: 'APIFY_API_TOKEN not configured — skipping HelloWork jobs fetch' });
      return [];
    }

    try {
      const client = new ApifyClient({ token: this.apifyToken });
      const run = await client.actor('misceres/hellowork-scraper').call({
        query,
        location: location ?? 'France',
        maxItems: 50,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      return (items as ApifyHelloworkItem[]).map((item) => ({
        companyName: item.company ?? 'Unknown',
        jobTitle: item.title ?? '',
        platform: 'hellowork' as const,
        url: item.url ?? '',
        location: item.location,
        salary: item.salary,
        publishedAt: item.date ? new Date(item.date) : new Date(),
        rawData: item as Record<string, unknown>,
      }));
    } catch (error) {
      this.logger.error({
        msg: 'HelloWork Apify actor failed',
        error: (error as Error).message,
      });
      return [];
    }
  }

  private async fetchIndeed(query: string, location?: string): Promise<JobPosting[]> {
    if (!this.hasdataKey) {
      this.logger.warn({ msg: 'HASDATA_API_KEY not configured — skipping Indeed jobs fetch' });
      return [];
    }

    try {
      const url = new URL('/scrape/indeed/jobs', this.hasdataBaseUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('l', location ?? 'France');
      url.searchParams.set('limit', '50');

      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.hasdataKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`HasData Indeed API responded with ${response.status}`);
      }

      const data = (await response.json()) as { jobs?: HasDataJob[] };
      const jobs = data.jobs ?? [];

      return jobs.map((item) => ({
        companyName: item.company ?? 'Unknown',
        jobTitle: item.title ?? '',
        platform: 'indeed' as const,
        url: item.url ?? '',
        location: item.location,
        salary: item.salary,
        publishedAt: item.date ? new Date(item.date) : new Date(),
        rawData: item as Record<string, unknown>,
      }));
    } catch (error) {
      this.logger.error({
        msg: 'HasData Indeed API failed',
        error: (error as Error).message,
      });
      return [];
    }
  }

  private deduplicateByCompany(postings: JobPosting[]): JobPosting[] {
    const seen = new Map<string, JobPosting[]>();

    for (const posting of postings) {
      const key = posting.companyName.toLowerCase().trim();
      const existing = seen.get(key);
      if (existing) {
        const isDuplicate = existing.some(
          (p) => p.jobTitle.toLowerCase() === posting.jobTitle.toLowerCase(),
        );
        if (!isDuplicate) {
          existing.push(posting);
        }
      } else {
        seen.set(key, [posting]);
      }
    }

    return Array.from(seen.values()).flat();
  }

  private groupByCompany(postings: JobPosting[]): Record<string, JobPosting[]> {
    const groups: Record<string, JobPosting[]> = {};

    for (const posting of postings) {
      const key = posting.companyName.toLowerCase().trim();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(posting);
    }

    return groups;
  }
}
