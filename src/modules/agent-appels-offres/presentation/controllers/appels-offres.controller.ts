import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Roles } from '@common/decorators/roles.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { AnalyzeTenderCommand } from '../../application/commands/analyze-tender.command';
import { GetTenderAnalysisQuery } from '../../application/queries/get-tender-analysis.query';
import { AppelsOffresService } from '../../application/services/appels-offres.service';
import { AnalyzeTenderSchema } from '../../application/dtos/appels-offres.dto';
import { z } from 'zod';

const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ResultSchema = z.object({
  result: z.enum(['GAGNE', 'PERDU', 'SANS_SUITE']),
  details: z.record(z.any()).optional(),
});

const JonathanDecisionSchema = z.object({
  decision: z.enum(['CONFIRME_GO', 'FORCE_GO', 'NO_GO']),
  reason: z.string().optional(),
});

@Controller('agents/appels-offres')
export class AppelsOffresController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly appelsOffresService: AppelsOffresService,
  ) {}

  // ─── TENDERS CRUD ──────────────────────────────────────────

  @Get('tenders')
  @Roles('admin', 'manager', 'viewer')
  async listTenders(@Query(new ZodValidationPipe(PaginationSchema)) query: any) {
    return this.appelsOffresService.listTenders(query.page, query.limit);
  }

  @Get('tenders/:id')
  @Roles('admin', 'manager', 'viewer')
  async getTender(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.getTender(id);
  }

  @Get('tenders/:id/analysis')
  @Roles('admin', 'manager', 'viewer')
  async getTenderAnalysis(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.getAnalysis(id);
  }

  // ─── PIPELINE ──────────────────────────────────────────────

  @Post('tenders/:id/pipeline/launch')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.ACCEPTED)
  async launchPipeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.launchPipeline(id);
  }

  @Get('tenders/:id/pipeline/progress')
  @Roles('admin', 'manager', 'viewer')
  async getPipelineProgress(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.getPipelineProgress(id);
  }

  // ─── INDIVIDUAL SUB-AGENT TRIGGERS ─────────────────────────

  @Post('tenders/:id/analyze-dce')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async analyzeDce(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.analyzeDce(id);
  }

  @Post('tenders/:id/qualify')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async qualifyTender(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AnalyzeTenderSchema)) body: any,
  ) {
    return this.appelsOffresService.qualifyTender(id, body.forceReanalyze);
  }

  @Post('tenders/:id/dossier-admin')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async prepareDossierAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.prepareDossierAdmin(id);
  }

  @Post('tenders/:id/offre-financiere')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async generateOffreFinanciere(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.generateOffreFinanciere(id);
  }

  @Post('tenders/:id/memoire-technique')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async generateMemoireTechnique(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.generateMemoireTechnique(id);
  }

  @Post('tenders/:id/quality-control')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async runQualityControl(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.runQualityControl(id);
  }

  // ─── MONITORING ────────────────────────────────────────────

  @Get('tenders/:id/monitor')
  @Roles('admin', 'manager', 'viewer')
  async getMonitorStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.appelsOffresService.getMonitorStatus(id);
  }

  @Post('tenders/:id/result')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async processResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResultSchema)) body: any,
  ) {
    return this.appelsOffresService.processResult(id, body.result, body.details);
  }

  // ─── JONATHAN DECISION ─────────────────────────────────────

  @Post('tenders/:id/decision')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async jonathanDecision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(JonathanDecisionSchema)) body: any,
  ) {
    await this.appelsOffresService.jonathanDecision(id, body.decision, body.reason);
    return { ok: true, decision: body.decision };
  }

  // ─── CQRS ENDPOINTS (legacy compatibility) ─────────────────

  @Post('tenders/:id/analyze-cqrs')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeTenderCqrs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { forceReanalyze?: boolean },
  ) {
    return this.commandBus.execute(new AnalyzeTenderCommand(id, body.forceReanalyze ?? false));
  }

  @Get('tenders/:id/analysis-cqrs')
  @Roles('admin', 'manager', 'viewer')
  async getTenderAnalysisCqrs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeHistory') includeHistory?: string,
  ) {
    return this.queryBus.execute(new GetTenderAnalysisQuery(id, includeHistory === 'true'));
  }

  // ─── HEALTH CHECK ──────────────────────────────────────────

  @Get('health')
  @Roles('admin', 'manager', 'viewer')
  async healthCheck() {
    return this.appelsOffresService.healthCheck();
  }
}
