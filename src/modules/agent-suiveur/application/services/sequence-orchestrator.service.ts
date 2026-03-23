import { Injectable } from '@nestjs/common';

interface SequenceConfig {
  delayDays: number[];
  maxSteps: number;
}

@Injectable()
export class SequenceOrchestratorService {
  private readonly SEQUENCES: Record<string, SequenceConfig> = {
    seq_hot_a_vip: { delayDays: [0, 2, 5, 10], maxSteps: 4 },
    seq_hot_b_standard: { delayDays: [0, 2, 5, 10], maxSteps: 4 },
    seq_hot_c_nurture: { delayDays: [0, 3, 7, 14], maxSteps: 4 },
    seq_warm_nurture: { delayDays: [0, 3, 7, 14, 21], maxSteps: 5 },
    seq_cold_newsletter: { delayDays: [0, 3, 7, 14, 21, 30, 45], maxSteps: 7 },
  };

  getNextStepDelay(
    sequenceId: string,
    currentStep: number,
  ): { delayMs: number; hasNextStep: boolean } {
    const seq = this.SEQUENCES[sequenceId] ?? this.SEQUENCES['seq_warm_nurture']!;
    if (currentStep >= seq.maxSteps - 1) return { delayMs: 0, hasNextStep: false };
    const nextDay = seq.delayDays[currentStep + 1] ?? 7;
    const currentDay = seq.delayDays[currentStep] ?? 0;
    const delayDays = nextDay - currentDay;
    return { delayMs: delayDays * 24 * 60 * 60 * 1000, hasNextStep: true };
  }

  calculateSendTime(baseTime: Date): Date {
    const send = new Date(baseTime);
    // Optimal hours: 8-10h
    const hour = 8 + Math.floor(Math.random() * 3);
    const minute = Math.floor(Math.random() * 20);
    send.setHours(hour, minute, 0, 0);
    // Skip weekends
    while (send.getDay() === 0 || send.getDay() === 6) {
      send.setDate(send.getDate() + 1);
    }
    return send;
  }

  isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
  }
}
