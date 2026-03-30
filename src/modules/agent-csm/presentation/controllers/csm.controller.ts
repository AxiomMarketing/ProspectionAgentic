import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { Roles } from '@common/decorators/roles.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { CsmService } from '../../application/services/csm.service';
import { OnboardCustomerSchema, ReferralSubmitSchema, UpdateCustomerSchema } from '../../application/dtos/onboard-customer.dto';

@Controller('agents/csm')
export class CsmController {
  private readonly logger = new Logger(CsmController.name);

  constructor(private readonly csmService: CsmService) {}

  // ══════════════════ CUSTOMER CRUD ══════════════════

  @Post('onboard')
  @Roles('admin', 'manager')
  async onboardCustomer(@Body(new ZodValidationPipe(OnboardCustomerSchema)) dto: any) {
    const result = await this.csmService.onboardCustomer(dto);
    return result.toPlainObject();
  }

  @Get('customers')
  @Roles('admin', 'manager', 'viewer')
  async listCustomers(
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.csmService.listCustomers({
      status,
      take: take ? parseInt(take, 10) : 20,
      skip: skip ? parseInt(skip, 10) : 0,
    });
  }

  @Get('customers/:id')
  @Roles('admin', 'manager', 'viewer')
  async getCustomer(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.getCustomerDetail(id);
  }

  @Patch('customers/:id')
  @Roles('admin', 'manager')
  async updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(UpdateCustomerSchema)) body: any) {
    return this.csmService.updateCustomer(id, body);
  }

  // ══════════════════ HEALTH SCORE ══════════════════

  @Get('customers/:id/health')
  @Roles('admin', 'manager', 'viewer')
  async getHealthScore(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.calculateHealthScore(id);
  }

  @Get('customers/:id/health-history')
  @Roles('admin', 'manager', 'viewer')
  async getHealthHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('take') take?: string,
  ) {
    return this.csmService.getHealthHistory(id, take ? parseInt(take, 10) : 30);
  }

  @Post('customers/:id/health/recalculate')
  @Roles('admin')
  async recalculateHealth(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.calculateHealthScore(id);
  }

  // ══════════════════ CHURN ══════════════════

  @Get('churn-risk')
  @Roles('admin', 'manager', 'viewer')
  async getChurnRisk() {
    return this.csmService.predictChurn();
  }

  @Get('customers/:id/churn-signals')
  @Roles('admin', 'manager')
  async getChurnSignals(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.detectChurnSignals(id);
  }

  // ══════════════════ ONBOARDING ══════════════════

  @Get('customers/:id/onboarding')
  @Roles('admin', 'manager', 'viewer')
  async getOnboarding(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.getOnboardingPlan(id);
  }

  @Get('onboardings/at-risk')
  @Roles('admin', 'manager')
  async getAtRiskOnboardings() {
    return this.csmService.checkOnboardingRisks();
  }

  // ══════════════════ UPSELL ══════════════════

  @Get('customers/:id/upsell')
  @Roles('admin', 'manager')
  async getUpsellOpportunities(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.evaluateUpsell(id);
  }

  @Get('upsell-pipeline')
  @Roles('admin', 'manager', 'viewer')
  async getUpsellPipeline() {
    return this.csmService.getUpsellPipeline();
  }

  // ══════════════════ REVIEWS ══════════════════

  @Get('customers/:id/reviews')
  @Roles('admin', 'manager', 'viewer')
  async getReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.csmService.getReviewRequests(id);
  }

  @Get('negative-reviews')
  @Roles('admin', 'manager')
  async getNegativeReviews() {
    return this.csmService.getNegativeReviews();
  }

  @Post('negative-reviews/:id/respond')
  @Roles('admin')
  async respondToNegativeReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { response: string },
  ) {
    return this.csmService.respondToNegativeReview(id, body.response);
  }

  // ══════════════════ REFERRAL ══════════════════

  @Get('referral-programs')
  @Roles('admin', 'manager', 'viewer')
  async getReferralPrograms() {
    return this.csmService.getReferralPrograms();
  }

  @Post('referral/submit/:code')
  @Roles('admin', 'manager')
  async submitReferral(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(ReferralSubmitSchema))
    body: any,
  ) {
    return this.csmService.submitReferral(code, body);
  }

  @Get('referral-leads')
  @Roles('admin', 'manager')
  async getReferralLeads() {
    return this.csmService.getReferralLeads();
  }

  // ══════════════════ METRICS ══════════════════

  @Get('metrics/snapshot')
  @Roles('admin', 'manager', 'viewer')
  async getDailySnapshot() {
    return this.csmService.getDailySnapshot();
  }

  @Get('metrics/health-distribution')
  @Roles('admin', 'manager', 'viewer')
  async getHealthDistribution() {
    return this.csmService.getHealthDistribution();
  }
}
