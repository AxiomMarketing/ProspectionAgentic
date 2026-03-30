import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  Param,
  UsePipes,
  ParseBoolPipe,
  Optional,
} from '@nestjs/common';
import { AnalysteService } from '../../application/services/analyste.service';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { AnalyzePipelineSchema, AnalyzePipelineDto, MetricsQuerySchema, MetricsQueryDto } from '../../application/dtos/analyste.dto';

@Controller('agents/analyste')
export class AnalysteController {
  constructor(private readonly analysteService: AnalysteService) {}

  @Public()
  @Get('health')
  getHealth(): { status: string; agent: string } {
    return { status: 'ok', agent: 'analyste' };
  }

  @Roles('admin')
  @Post('analyze')
  @UsePipes(new ZodValidationPipe(AnalyzePipelineSchema))
  async analyzePipeline(@Body() body: AnalyzePipelineDto): Promise<void> {
    const dateFrom = new Date(body.dateFrom);
    const dateTo = new Date(body.dateTo);
    const snapshotDate = dateFrom.toISOString().split('T')[0];
    void dateTo;
    await this.analysteService.triggerDailyAnalysis();
    void snapshotDate;
  }

  @Roles('admin', 'manager')
  @Get('metrics')
  async getMetrics(
    @Query(new ZodValidationPipe(MetricsQuerySchema)) query: MetricsQueryDto,
  ) {
    const now = new Date();
    const dateTo = query.dateTo ? new Date(query.dateTo) : now;
    const dateFrom = query.dateFrom
      ? new Date(query.dateFrom)
      : new Date(now.getTime() - (query.limit ?? 30) * 24 * 60 * 60 * 1000);

    return this.analysteService.getDashboardSummary(dateFrom, dateTo);
  }

  @Roles('admin', 'manager')
  @Get('reports/:type')
  async getReport(@Param('type') type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
    if (type === 'daily') {
      await this.analysteService.triggerDailyAnalysis();
    } else if (type === 'weekly') {
      await this.analysteService.triggerWeeklyReport();
    } else {
      await this.analysteService.triggerMonthlyReport();
    }
  }

  @Roles('admin', 'manager')
  @Get('alerts')
  async getAlerts(@Query('resolved') resolved?: string) {
    const resolvedBool = resolved !== undefined ? resolved === 'true' : undefined;
    return this.analysteService.getAlerts(resolvedBool);
  }

  @Roles('admin', 'manager')
  @Put('alerts/:id/acknowledge')
  async acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysteService.acknowledgeAlert(id, user.id);
  }

  @Roles('admin', 'manager')
  @Get('recommendations')
  async getRecommendations(@Query('status') status?: string) {
    return this.analysteService.getRecommendations(status || 'PENDING');
  }

  @Roles('admin')
  @Put('recommendations/:id/approve')
  async approveRecommendation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysteService.approveRecommendation(id, user.id);
  }

  @Roles('admin')
  @Put('recommendations/:id/reject')
  async rejectRecommendation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.analysteService.rejectRecommendation(id, user.id);
  }
}
