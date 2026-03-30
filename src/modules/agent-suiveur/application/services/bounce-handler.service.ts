import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';

@Injectable()
export class BounceHandlerService {
  private readonly logger = new Logger(BounceHandlerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleBounce(
    email: string,
    bounceType: string,
    bounceCode: string | null,
    provider: string,
    emailSendId: string | null,
  ): Promise<void> {
    this.logger.log({ msg: 'Handling bounce', email, bounceType, provider });

    const prospect = await this.prisma.prospect.findFirst({ where: { email } });

    await this.prisma.bounceEvent.create({
      data: {
        email,
        prospectId: prospect?.id ?? null,
        emailSendId: emailSendId ?? null,
        bounceType,
        bounceCode: bounceCode ?? null,
        provider,
      },
    });

    if (emailSendId) {
      await this.prisma.emailSend.update({
        where: { id: emailSendId },
        data: { bouncedAt: new Date(), bounceType, status: 'bounced' },
      });
    }

    if (bounceType === 'hard') {
      await this.blacklistProspect(email, 'hard_bounce');
      return;
    }

    // Auto-blacklist after 3+ bounces
    if (prospect) {
      const bounceCount = await this.prisma.bounceEvent.count({
        where: { email },
      });
      if (bounceCount >= 3) {
        await this.blacklistProspect(email, 'repeated_bounces');
      }
    }
  }

  async handleComplaint(email: string): Promise<void> {
    this.logger.log({ msg: 'Handling complaint', email });
    await this.blacklistProspect(email, 'spam_complaint');
  }

  async handleUnsubscribe(email: string): Promise<void> {
    this.logger.log({ msg: 'Handling unsubscribe', email });

    const prospect = await this.prisma.prospect.findFirst({ where: { email } });
    if (!prospect) {
      this.logger.warn({ msg: 'Unsubscribe: prospect not found', email });
      return;
    }

    await this.prisma.prospect.update({
      where: { id: prospect.id },
      data: { status: 'unsubscribed' },
    });

    await this.prisma.rgpdBlacklist.create({
      data: {
        email,
        reason: 'unsubscribed',
        source: 'mailgun_webhook',
      },
    });
  }

  private async blacklistProspect(email: string, reason: string): Promise<void> {
    const prospect = await this.prisma.prospect.findFirst({ where: { email } });
    if (prospect) {
      await this.prisma.prospect.update({
        where: { id: prospect.id },
        data: { status: 'blacklisted' },
      });
    }

    const existing = await this.prisma.rgpdBlacklist.findFirst({ where: { email } });
    if (!existing) {
      await this.prisma.rgpdBlacklist.create({
        data: { email, reason, source: 'mailgun_webhook' },
      });
    }

    this.logger.log({ msg: 'Prospect blacklisted', email, reason });
  }
}
