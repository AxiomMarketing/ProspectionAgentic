import { Controller, Post, Put, Body, Param } from '@nestjs/common';
import { NurtureurService } from '../../application/services/nurtureur.service';
import { StartNurtureSchema, StartNurtureDto } from '../../application/dtos/start-nurture.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@Controller('api/agents/nurtureur')
export class NurtureurController {
  constructor(private readonly nurtureurService: NurtureurService) {}

  @Post('start')
  async start(@Body(new ZodValidationPipe(StartNurtureSchema)) dto: StartNurtureDto) {
    return (await this.nurtureurService.startNurture(dto)).toPlainObject();
  }

  @Put(':id/pause')
  async pause(@Param('id') id: string) {
    return (await this.nurtureurService.pauseNurture(id)).toPlainObject();
  }

  @Put(':id/reactivate')
  async reactivate(@Param('id') id: string) {
    return (await this.nurtureurService.reactivateProspect(id)).toPlainObject();
  }
}
