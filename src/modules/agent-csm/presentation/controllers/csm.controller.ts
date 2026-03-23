import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { CsmService } from '../../application/services/csm.service';
import {
  OnboardCustomerSchema,
  OnboardCustomerDto,
} from '../../application/dtos/onboard-customer.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('agents/csm')
export class CsmController {
  constructor(private readonly csmService: CsmService) {}

  @Post('onboard')
  async onboard(@Body(new ZodValidationPipe(OnboardCustomerSchema)) dto: OnboardCustomerDto) {
    return (await this.csmService.onboardCustomer(dto)).toPlainObject();
  }

  @Get('customers/:id/health')
  async getHealth(@Param('id') id: string) {
    return (await this.csmService.calculateHealthScore(id)).toPlainObject();
  }

  @Get('churn-risk')
  async getChurnRisk() {
    return (await this.csmService.predictChurn()).map((c) => c.toPlainObject());
  }
}
