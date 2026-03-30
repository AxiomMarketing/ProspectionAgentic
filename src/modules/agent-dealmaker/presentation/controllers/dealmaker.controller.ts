import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Param,
  Query,
  Headers,
  Header,
  Ip,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DealmakerService } from '../../application/services/dealmaker.service';
import {
  CreateDealSchema,
  CreateDealDto,
  AdvanceStageSchema,
  AdvanceStageDto,
} from '../../application/dtos/dealmaker.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';

@Controller('agents/dealmaker')
export class DealmakerController {
  constructor(private readonly dealmakerService: DealmakerService) {}

  @Public()
  @Get('health')
  health(): { status: string; agent: string } {
    return { status: 'ok', agent: 'dealmaker' };
  }

  @Roles('admin', 'manager')
  @Post('deals')
  async createDeal(
    @Body(new ZodValidationPipe(CreateDealSchema)) dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return (await this.dealmakerService.createDeal(dto, user.id)).toPlainObject();
  }

  @Roles('admin', 'manager')
  @Get('deals')
  async listDeals(
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
  ) {
    const deals = await this.dealmakerService.listDeals({ take, skip });
    return deals.map((d) => d.toPlainObject());
  }

  @Roles('admin', 'manager')
  @Get('deals/:id')
  async getDeal(@Param('id', new ParseUUIDPipe()) id: string) {
    return (await this.dealmakerService.getDeal(id)).toPlainObject();
  }

  @Roles('admin', 'manager')
  @Put('deals/:id/stage')
  async advanceStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AdvanceStageSchema)) dto: AdvanceStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return (
      await this.dealmakerService.advanceStage(id, dto.stage, dto.reason, user.id)
    ).toPlainObject();
  }

  @Roles('admin', 'manager')
  @Post('deals/:id/quote')
  async generateQuote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const deal = await this.dealmakerService.getDeal(id);
    return this.dealmakerService.generateQuote(deal.id, deal.prospectId);
  }

  @Roles('admin', 'manager')
  @Post('deals/:id/sign')
  async startSignature(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.dealmakerService.startSignatureProcess(id);
    return { started: true, dealId: id };
  }

  @Public()
  @Post('webhooks/yousign')
  @HttpCode(HttpStatus.OK)
  async yousignWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-yousign-signature') signature: string | undefined,
  ) {
    const eventType = (body['event_name'] ?? body['type']) as string | undefined;
    await this.dealmakerService.handleYousignWebhook(eventType ?? '', body, signature);
    return { received: true };
  }

  @Public()
  @Get('tracking/:trackingId.gif')
  @Header('Content-Type', 'image/gif')
  async trackingPixel(
    @Param('trackingId') trackingId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.dealmakerService.handleTrackingPixel(trackingId, ip, userAgent);
  }
}
