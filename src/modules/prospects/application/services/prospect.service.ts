import { Injectable, Logger } from '@nestjs/common';
import {
  IProspectRepository,
  ProspectFilter,
} from '../../domain/repositories/i-prospect.repository';
import { Prospect } from '../../domain/entities/prospect.entity';
import { CreateProspectDto, UpdateProspectDto } from '../dtos/create-prospect.dto';
import { ProspectNotFoundException } from '@common/exceptions/prospect-not-found.exception';

@Injectable()
export class ProspectService {
  private readonly logger = new Logger(ProspectService.name);

  constructor(private readonly prospectRepository: IProspectRepository) {}

  async create(dto: CreateProspectDto): Promise<Prospect> {
    const prospect = Prospect.create(dto);
    const saved = await this.prospectRepository.save(prospect);
    this.logger.log({ msg: 'Prospect created', id: saved.id });
    return saved;
  }

  async findById(id: string): Promise<Prospect> {
    const prospect = await this.prospectRepository.findById(id);
    if (!prospect) throw new ProspectNotFoundException(id);
    return prospect;
  }

  async findAll(filter?: ProspectFilter, page = 1, pageSize = 20) {
    return this.prospectRepository.findAll(filter, page, pageSize);
  }

  async update(id: string, dto: UpdateProspectDto): Promise<Prospect> {
    const existing = await this.findById(id);
    const updated = Prospect.reconstitute({
      ...existing.toPlainObject(),
      ...dto,
      updatedAt: new Date(),
    });
    return this.prospectRepository.update(updated);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id); // Verify exists
    await this.prospectRepository.delete(id);
    this.logger.log({ msg: 'Prospect deleted', id });
  }

  async countByStatus(): Promise<Record<string, number>> {
    return this.prospectRepository.countByStatus();
  }
}
