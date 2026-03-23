import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { INurtureSequenceRepository } from '../../domain/repositories/i-nurture-sequence.repository';
import { NurtureSequence } from '../../domain/entities/nurture-sequence.entity';
import { StartNurtureDto } from '../dtos/start-nurture.dto';
import { PrismaService } from '@core/database/prisma.service';
import { QUEUE_NAMES } from '@shared/constants/queue-names.constant';

@Injectable()
export class NurtureurService {
  private readonly logger = new Logger(NurtureurService.name);

  constructor(
    private readonly nurtureSequenceRepository: INurtureSequenceRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCOREUR_PIPELINE) private readonly scoreurQueue: Queue,
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

  async processNurtureStep(prospectId: string): Promise<void> {
    this.logger.log({ msg: 'Processing nurture step', prospectId });

    const sequence = await this.nurtureSequenceRepository.findByProspectId(prospectId);
    if (!sequence) {
      this.logger.warn({ msg: 'No active nurture sequence found', prospectId });
      return;
    }

    const emailSent = await this.prisma.emailSend.count({
      where: { prospectId },
    });

    this.eventEmitter.emit('nurture.step.processed', {
      sequenceId: sequence.id,
      prospectId,
      stepType: emailSent > 0 ? 'linkedin_engagement' : 'email_content',
    });

    this.logger.log({ msg: 'Nurture step processed', prospectId, sequenceId: sequence.id });
  }

  async checkReEngagement(): Promise<void> {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const inactiveProspects = await this.prisma.prospect.findMany({
      where: {
        updatedAt: { lt: sixtyDaysAgo },
        status: { notIn: ['won', 'lost', 'blacklisted', 'unsubscribed'] },
      },
      select: { id: true },
    });

    this.logger.log({ msg: 'Re-engagement check', count: inactiveProspects.length });

    for (const prospect of inactiveProspects) {
      const existing = await this.nurtureSequenceRepository.findByProspectId(prospect.id);
      if (!existing || existing.status === 'exited') {
        await this.startNurture({ prospectId: prospect.id, reason: 're_engagement_60d' });
      }
    }
  }

  async checkSunset(): Promise<void> {
    const oneHundredEightyDaysAgo = new Date();
    oneHundredEightyDaysAgo.setDate(oneHundredEightyDaysAgo.getDate() - 180);

    const oldSequences = await this.prisma.nurtureProspect.findMany({
      where: {
        entryDate: { lt: oneHundredEightyDaysAgo },
        status: { not: 'exited' },
      },
      select: { id: true },
    });

    this.logger.log({ msg: 'Sunset check', count: oldSequences.length });

    for (const record of oldSequences) {
      const sequence = await this.nurtureSequenceRepository.findById(record.id);
      if (sequence) {
        const exited = sequence.exit('rgpd_sunset_180d');
        await this.nurtureSequenceRepository.update(exited);
        this.eventEmitter.emit('nurture.exited', {
          sequenceId: sequence.id,
          prospectId: sequence.prospectId,
          reason: 'rgpd_sunset_180d',
        });
      }
    }
  }

  async triggerReScore(prospectId: string): Promise<void> {
    this.logger.log({ msg: 'Triggering re-score', prospectId });

    await this.scoreurQueue.add('score-prospect', { prospectId, trigger: 'nurture_engagement' });

    this.eventEmitter.emit('nurture.rescore.triggered', { prospectId });
  }
}
