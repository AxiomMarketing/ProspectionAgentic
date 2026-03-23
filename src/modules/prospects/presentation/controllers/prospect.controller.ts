import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ProspectService } from '../../application/services/prospect.service';
import {
  CreateProspectSchema,
  CreateProspectDto,
  UpdateProspectSchema,
  UpdateProspectDto,
} from '../../application/dtos/create-prospect.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { UuidParamSchema } from '@shared/dtos/id-param.dto';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('prospects')
export class ProspectController {
  constructor(private readonly prospectService: ProspectService) {}

  @Post()
  async create(@Body(new ZodValidationPipe(CreateProspectSchema)) dto: CreateProspectDto) {
    return this.prospectService.create(dto);
  }

  @Get()
  async findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.prospectService.findAll(undefined, page ? +page : 1, pageSize ? +pageSize : 20);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.prospectService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProspectSchema)) dto: UpdateProspectDto,
  ) {
    return this.prospectService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.prospectService.delete(id);
  }

  @Get('stats/by-status')
  async countByStatus() {
    return this.prospectService.countByStatus();
  }
}
