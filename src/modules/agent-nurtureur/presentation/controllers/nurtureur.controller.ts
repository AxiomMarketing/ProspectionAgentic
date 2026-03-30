import * as crypto from 'crypto';
import { Controller, Post, Put, Get, Body, Param, ParseUUIDPipe, Logger, HttpCode, HttpStatus, UnauthorizedException, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@core/database/prisma.service';
import { NurtureurService } from '../../application/services/nurtureur.service';
import { ReScorerService } from '../../application/services/re-scorer.service';
import { StartNurtureSchema, StartNurtureDto } from '../../application/dtos/start-nurture.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('agents/nurtureur')
export class NurtureurController {
  private readonly logger = new Logger(NurtureurController.name);

  constructor(
    private readonly nurtureurService: NurtureurService,
    private readonly reScorerService: ReScorerService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Roles('admin', 'manager')
  @Post('start')
  async start(@Body(new ZodValidationPipe(StartNurtureSchema)) dto: StartNurtureDto) {
    return (await this.nurtureurService.startNurture(dto)).toPlainObject();
  }

  @Roles('admin', 'manager')
  @Put(':id/pause')
  async pause(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.nurtureurService.pauseNurture(id)).toPlainObject();
  }

  @Roles('admin', 'manager')
  @Put(':id/reactivate')
  async reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.nurtureurService.reactivateProspect(id)).toPlainObject();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('status/:prospectId')
  async getStatus(@Param('prospectId', ParseUUIDPipe) prospectId: string) {
    const nurture = await this.prisma.nurtureProspect.findFirst({
      where: { prospectId },
      select: {
        status: true,
        currentStep: true,
        totalSteps: true,
        journeyStage: true,
        entryDate: true,
        engagementScoreCurrent: true,
        engagementScoreInitial: true,
      },
    });
    return { prospectId, nurture };
  }

  @Public()
  @Post('webhook/mailgun')
  @HttpCode(HttpStatus.OK)
  async mailgunWebhook(
    @Headers('x-mailgun-timestamp') timestamp: string,
    @Headers('x-mailgun-token') token: string,
    @Headers('x-mailgun-signature') signature: string,
    @Body() body: { email?: string; recipient?: string },
  ) {
    if (!this.verifyMailgunSignature(timestamp, token, signature)) {
      throw new UnauthorizedException('Invalid Mailgun signature');
    }

    const email = body.email ?? body.recipient;
    if (email) {
      this.eventEmitter.emit('mailgun.unsubscribed', { email });
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
}
