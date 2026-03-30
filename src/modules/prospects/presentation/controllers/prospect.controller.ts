import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
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
import type { ProspectFilter } from '../../domain/repositories/i-prospect.repository';

@Controller('prospects')
export class ProspectController {
  constructor(private readonly prospectService: ProspectService) {}

  @Roles('admin', 'manager')
  @Post()
  async create(@Body(new ZodValidationPipe(CreateProspectSchema)) dto: CreateProspectDto) {
    return this.prospectService.create(dto);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('segment') segment?: string,
    @Query('source') source?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const filter: ProspectFilter = {};
    if (search) filter.search = search;
    if (status) filter.status = [status];
    if (segment) filter.segment = segment;
    if (source) filter.source = source;
    if (minScore !== undefined) filter.scoreMin = +minScore;
    if (maxScore !== undefined) filter.scoreMax = +maxScore;
    if (sortBy) filter.sortBy = sortBy;
    if (sortOrder === 'asc' || sortOrder === 'desc') filter.sortOrder = sortOrder;
    const result = await this.prospectService.findAll(filter, page ? +page : 1, limit ? +limit : 20);
    // Flatten domain entities to plain objects for the API response
    return {
      ...result,
      data: result.data.map((p: any) => p.toPlainObject ? p.toPlainObject() : p),
    };
  }

  @Roles('admin', 'manager', 'viewer')
  @Get(':id')
  async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    const prospect = await this.prospectService.findById(id);
    // Flatten domain entity to plain object
    return (prospect as any).toPlainObject ? (prospect as any).toPlainObject() : prospect;
  }

  @Roles('admin', 'manager')
  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateProspectSchema)) dto: UpdateProspectDto,
  ) {
    return this.prospectService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.prospectService.delete(id);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('stats/by-status')
  async countByStatus() {
    return this.prospectService.countByStatus();
  }
}
