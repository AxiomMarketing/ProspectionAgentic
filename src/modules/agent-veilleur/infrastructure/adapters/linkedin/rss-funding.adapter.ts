import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Parser from 'rss-parser';
import { LinkedInSignal } from './linkedin-signal.interface';

const FUNDING_ROUND_PATTERNS: { pattern: RegExp; label: string; score: number }[] = [
  { pattern: /série\s+[A-Z]/i, label: 'Série A/B/C+', score: 30 },
  { pattern: /series\s+[A-Z]/i, label: 'Series round', score: 30 },
  { pattern: /seed/i, label: 'Seed', score: 25 },
  { pattern: /amorçage/i, label: 'Amorçage', score: 25 },
  { pattern: /levée de fonds/i, label: 'Levée de fonds', score: 28 },
  { pattern: /fundraising/i, label: 'Fundraising', score: 28 },
  { pattern: /lève\s+\d/i, label: 'Financement', score: 27 },
  { pattern: /millions?/i, label: 'Tour de financement', score: 26 },
];

const AMOUNT_PATTERN = /(\d+(?:[,.]\d+)?)\s*(?:millions?|M€|M\$|k€)/i;

@Injectable()
export class RssFundingAdapter {
  private readonly logger = new Logger(RssFundingAdapter.name);
  private readonly parser = new Parser({ timeout: 10_000 });

  constructor(private readonly configService: ConfigService) {}

  async getFundingEvents(): Promise<LinkedInSignal[]> {
    const feedUrls = this.buildFeedUrls();
    if (feedUrls.length === 0) {
      this.logger.warn({ msg: 'No RSS feed URLs configured' });
      return [];
    }

    const results = await Promise.allSettled(
      feedUrls.map((url) => this.parseFeed(url)),
    );

    const signals: LinkedInSignal[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      }
    }

    this.logger.log({ msg: 'RSS funding events fetched', count: signals.length });
    return signals;
  }

  private buildFeedUrls(): string[] {
    const urls: string[] = [];
    const keys = [
      'RSS_CRUNCHBASE_URL',
      'RSS_MADDYNESS_URL',
      'RSS_BPI_URL',
      'RSS_ECHOS_STARTUPS_URL',
    ];
    for (const key of keys) {
      const url = this.configService.get<string>(key);
      if (url) urls.push(url);
    }
    return urls;
  }

  private async parseFeed(url: string): Promise<LinkedInSignal[]> {
    try {
      const feed = await this.parser.parseURL(url);
      const signals: LinkedInSignal[] = [];

      for (const item of feed.items ?? []) {
        const title = item.title ?? '';
        const signal = this.extractFundingSignal(title, item.pubDate);
        if (signal) signals.push(signal);
      }

      return signals;
    } catch (error) {
      this.logger.warn({ msg: 'RSS feed parse failed', url, error: (error as Error).message });
      return [];
    }
  }

  private extractFundingSignal(title: string, pubDate?: string): LinkedInSignal | null {
    let matchedRound: { label: string; score: number } | null = null;
    for (const { pattern, label, score } of FUNDING_ROUND_PATTERNS) {
      if (pattern.test(title)) {
        matchedRound = { label, score };
        break;
      }
    }

    if (!matchedRound) return null;

    const companyName = this.extractCompanyName(title);
    const amountMatch = AMOUNT_PATTERN.exec(title);
    const amountDetail = amountMatch ? ` (${amountMatch[0]})` : '';

    return {
      type: 'funding',
      companyName,
      detail: `${matchedRound.label}${amountDetail} — ${title}`,
      score: matchedRound.score,
      detectedAt: pubDate ? new Date(pubDate) : new Date(),
    };
  }

  private extractCompanyName(title: string): string {
    // Try to extract company name before common funding keywords
    const beforeKeyword = title.split(/lève|seed|série|series|fundrais|levée/i)[0].trim();
    // Clean up common prefixes like "La startup X" or just "X"
    const cleaned = beforeKeyword
      .replace(/^(la startup|la société|la scaleup|le groupe|startup)\s+/i, '')
      .replace(/[,:]\s*$/, '')
      .trim();

    return cleaned || title.slice(0, 50);
  }
}
