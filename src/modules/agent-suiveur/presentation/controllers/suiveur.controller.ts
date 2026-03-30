import * as crypto from 'crypto';
import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe, Logger, HttpCode, HttpStatus, UnauthorizedException, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SuiveurService } from '../../application/services/suiveur.service';
import { BounceHandlerService } from '../../application/services/bounce-handler.service';
import { ExecuteStepSchema, ExecuteStepDto } from '../../application/dtos/execute-step.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PrismaService } from '@core/database/prisma.service';

@Controller('agents/suiveur')
export class SuiveurController {
  private readonly logger = new Logger(SuiveurController.name);

  constructor(
    private readonly suiveurService: SuiveurService,
    private readonly bounceHandler: BounceHandlerService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Post('execute-step')
  @UseGuards(JwtAuthGuard)
  async executeStep(@Body(new ZodValidationPipe(ExecuteStepSchema)) dto: ExecuteStepDto) {
    return this.suiveurService.executeSequenceStep(dto);
  }

  @Get('sends/:prospectId')
  @UseGuards(JwtAuthGuard)
  async getSends(@Param('prospectId', new ParseUUIDPipe()) prospectId: string) {
    return this.suiveurService.getSendsByProspectId(prospectId);
  }

  @Post('webhooks/mailgun')
  @HttpCode(HttpStatus.OK)
  async handleMailgunWebhook(
    @Headers('x-mailgun-timestamp') timestamp: string,
    @Headers('x-mailgun-token') token: string,
    @Headers('x-mailgun-signature') signature: string,
    @Body() body: any,
  ) {
    if (!this.verifyMailgunSignature(timestamp, token, signature)) {
      throw new UnauthorizedException('Invalid Mailgun signature');
    }

    const eventType = body?.['event-data']?.event ?? body?.event;
    const recipient = body?.['event-data']?.recipient ?? body?.recipient;
    const messageId = body?.['event-data']?.message?.headers?.['message-id'];

    this.logger.log({ msg: 'Mailgun webhook received', eventType, recipient });

    switch (eventType) {
      case 'delivered':
        await this.handleDelivered(recipient, messageId);
        break;
      case 'opened':
        await this.handleOpened(recipient, messageId);
        break;
      case 'clicked':
        await this.handleClicked(recipient, messageId);
        break;
      case 'failed':
      case 'bounced':
        await this.handleBounce(recipient, messageId, body);
        break;
      case 'complained':
        await this.handleComplaint(recipient);
        break;
      case 'unsubscribed':
        await this.handleUnsubscribe(recipient);
        break;
      default:
        this.logger.debug({ msg: 'Unhandled Mailgun event type', eventType });
    }

    return { received: true };
  }

  private verifyMailgunSignature(timestamp: string, token: string, signature: string): boolean {
    const signingKey = this.configService.get<string>('MAILGUN_WEBHOOK_SIGNING_KEY');
    if (!signingKey) return false;
    const computed = crypto.createHmac('sha256', signingKey)
      .update(timestamp + token)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  }

  private async resolveEmailSendId(toEmail: string, messageId: string | undefined): Promise<string | null> {
    if (!toEmail) return null;
    const send = await this.prisma.emailSend.findFirst({
      where: messageId
        ? { toEmail, providerMessageId: messageId }
        : { toEmail },
      orderBy: { sentAt: 'desc' },
    });
    return send?.id ?? null;
  }

  private async handleDelivered(recipient: string, messageId: string | undefined): Promise<void> {
    const emailSendId = await this.resolveEmailSendId(recipient, messageId);
    if (!emailSendId) return;
    await this.prisma.emailSend.update({
      where: { id: emailSendId },
      data: { deliveredAt: new Date(), status: 'delivered' },
    });
  }

  private async handleOpened(recipient: string, messageId: string | undefined): Promise<void> {
    const emailSendId = await this.resolveEmailSendId(recipient, messageId);
    if (!emailSendId) return;
    await this.prisma.emailSend.update({
      where: { id: emailSendId },
      data: { openedAt: new Date(), openCount: { increment: 1 }, status: 'opened' },
    });
  }

  private async handleClicked(recipient: string, messageId: string | undefined): Promise<void> {
    const emailSendId = await this.resolveEmailSendId(recipient, messageId);
    if (!emailSendId) return;
    await this.prisma.emailSend.update({
      where: { id: emailSendId },
      data: { clickedAt: new Date(), clickCount: { increment: 1 } },
    });
  }

  private async handleBounce(recipient: string, messageId: string | undefined, body: any): Promise<void> {
    const emailSendId = await this.resolveEmailSendId(recipient, messageId);
    const severity = body?.['event-data']?.['delivery-status']?.code
      ?? body?.['event-data']?.severity
      ?? body?.severity;
    const bounceCode = String(body?.['event-data']?.['delivery-status']?.code ?? '');
    const bounceType = severity === 'permanent' || body?.['event-data']?.event === 'bounced' ? 'hard' : 'soft';

    await this.bounceHandler.handleBounce(recipient, bounceType, bounceCode || null, 'mailgun', emailSendId);
  }

  private async handleComplaint(recipient: string): Promise<void> {
    await this.bounceHandler.handleComplaint(recipient);
  }

  private async handleUnsubscribe(recipient: string): Promise<void> {
    await this.bounceHandler.handleUnsubscribe(recipient);
  }
}
