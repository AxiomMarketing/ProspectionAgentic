import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReplyCategory, ClassificationResult } from './response-classifier.service';

export interface HandleActionParams {
  prospectId: string;
  sequenceId: string;
  messageSendId: string;
  classification: ClassificationResult;
  replyBody: string;
  fromAddress: string;
}

export interface ActionResult {
  action: string;
  sequenceStopped: boolean;
  sequencePaused: boolean;
  rescheduleAfterMs: number | null;
}

@Injectable()
export class ActionHandlerService {
  private readonly logger = new Logger(ActionHandlerService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async handle(params: HandleActionParams): Promise<ActionResult> {
    const { prospectId, sequenceId, messageSendId, classification } = params;

    this.logger.log({
      msg: 'Handling reply action',
      prospectId,
      category: classification.category,
      confidence: classification.confidence,
    });

    const handlers: Record<ReplyCategory, () => ActionResult> = {
      INTERESSE: () => {
        this.eventEmitter.emit('reply.interested', {
          prospectId,
          sequenceId,
          messageSendId,
          classification,
          urgent: true,
          notifyJonathan: true,
        });
        this.logger.log({ msg: 'INTERESSE: stopping sequence, notifying Jonathan', prospectId });
        return {
          action: 'stop_sequence_notify_jonathan',
          sequenceStopped: true,
          sequencePaused: false,
          rescheduleAfterMs: null,
        };
      },

      INTERESSE_SOFT: () => {
        this.eventEmitter.emit('reply.soft_interest', {
          prospectId,
          sequenceId,
          messageSendId,
          classification,
        });
        this.logger.log({ msg: 'INTERESSE_SOFT: pausing sequence', prospectId });
        return {
          action: 'pause_sequence_soft_interest',
          sequenceStopped: false,
          sequencePaused: true,
          rescheduleAfterMs: null,
        };
      },

      PAS_MAINTENANT: () => {
        // Reschedule in 30 days
        const rescheduleMs = 30 * 24 * 60 * 60 * 1000;
        this.eventEmitter.emit('reply.not_now', {
          prospectId,
          sequenceId,
          rescheduleAfterMs: rescheduleMs,
          classification,
        });
        this.logger.log({ msg: 'PAS_MAINTENANT: stopping and rescheduling in 30d', prospectId });
        return {
          action: 'stop_and_reschedule_30d',
          sequenceStopped: true,
          sequencePaused: false,
          rescheduleAfterMs: rescheduleMs,
        };
      },

      PAS_INTERESSE: () => {
        this.eventEmitter.emit('reply.not_interested', {
          prospectId,
          sequenceId,
          classification,
        });
        this.logger.log({ msg: 'PAS_INTERESSE: suppressing prospect', prospectId });
        return {
          action: 'suppress_prospect',
          sequenceStopped: true,
          sequencePaused: false,
          rescheduleAfterMs: null,
        };
      },

      MAUVAISE_PERSONNE: () => {
        const referree = classification.personneReferree;
        this.eventEmitter.emit('reply.wrong_person', {
          prospectId,
          sequenceId,
          referree,
          classification,
        });
        this.logger.log({ msg: 'MAUVAISE_PERSONNE: creating referral lead', prospectId, referree });
        return {
          action: 'create_referral_lead',
          sequenceStopped: true,
          sequencePaused: false,
          rescheduleAfterMs: null,
        };
      },

      DEMANDE_INFO: () => {
        this.eventEmitter.emit('reply.info_request', {
          prospectId,
          sequenceId,
          messageSendId,
          classification,
        });
        this.logger.log({ msg: 'DEMANDE_INFO: pausing sequence for info request', prospectId });
        return {
          action: 'pause_sequence_info_request',
          sequenceStopped: false,
          sequencePaused: true,
          rescheduleAfterMs: null,
        };
      },

      OUT_OF_OFFICE: () => {
        let resumeAfterMs = 3 * 24 * 60 * 60 * 1000; // default 3 days
        if (classification.dateRetourOoo) {
          const returnDate = new Date(classification.dateRetourOoo);
          // Resume 2 days after return
          resumeAfterMs = returnDate.getTime() - Date.now() + 2 * 24 * 60 * 60 * 1000;
          if (resumeAfterMs < 0) resumeAfterMs = 2 * 24 * 60 * 60 * 1000;
        }
        this.eventEmitter.emit('reply.out_of_office', {
          prospectId,
          sequenceId,
          resumeAfterMs,
          dateRetour: classification.dateRetourOoo,
          classification,
        });
        this.logger.log({
          msg: 'OUT_OF_OFFICE: pausing and scheduling resume',
          prospectId,
          resumeAfterMs,
        });
        return {
          action: 'pause_and_resume_after_ooo',
          sequenceStopped: false,
          sequencePaused: true,
          rescheduleAfterMs: resumeAfterMs,
        };
      },

      SPAM: () => {
        this.logger.log({ msg: 'SPAM: archiving only', prospectId });
        return {
          action: 'archive_only',
          sequenceStopped: false,
          sequencePaused: false,
          rescheduleAfterMs: null,
        };
      },
    };

    const handler = handlers[classification.category];
    return handler();
  }
}
