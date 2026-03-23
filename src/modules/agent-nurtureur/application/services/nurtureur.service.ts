import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';
import { StartNurtureDto } from '../dtos/start-nurture.dto';

@Injectable()
export class NurtureurService {
  private readonly logger = new Logger(NurtureurService.name);

  constructor(
    private readonly nurtureSequenceRepository: INurtureSequenceRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startNurture(dto: StartNurtureDto): Promise<NurtureSequence> {
    this.logger.log({ msg: 'Starting nurture sequence', prospectId: dto.prospectId });
    const sequence = NurtureSequence.create(dto.prospectId, dto.reason);
    const saved = await this.nurtureSequenceRepository.save(sequence);
    this.eventEmitter.emit('nurture.started', {
      sequenceId: saved.id,
      prospectId: saved.prospectId,
    });
    return saved;
  }

  async pauseNurture(id: string): Promise<NurtureSequence> {
    const sequence = await this.nurtureSequenceRepository.findById(id);
    if (!sequence) throw new NotFoundException(`NurtureSequence ${id} not found`);
    const paused = sequence.pause();
    return this.nurtureSequenceRepository.update(paused);
  }

  async reactivateProspect(id: string): Promise<NurtureSequence> {
    const sequence = await this.nurtureSequenceRepository.findById(id);
    if (!sequence) throw new NotFoundException(`NurtureSequence ${id} not found`);
    const reactivated = sequence.reactivate();
    this.eventEmitter.emit('nurture.reactivated', {
      sequenceId: id,
      prospectId: sequence.prospectId,
    });
    return this.nurtureSequenceRepository.update(reactivated);
  }
}
