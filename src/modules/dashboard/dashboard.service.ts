import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/database/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPipelineMetrics() {
    const prospectsByStatus = await this.prisma.prospect.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return {
      prospectsByStatus: Object.fromEntries(
        prospectsByStatus.map((r) => [r.status, r._count._all]),
      ),
    };
  }

  async getAgentStatuses() {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
    const events = await this.prisma.agentEvent.groupBy({
      by: ['agentName', 'eventType'],
      _count: { _all: true },
      _max: { createdAt: true },
      where: { createdAt: { gte: since } },
    });
    const byAgent: Record<string, { eventType: string; count: number; lastSeen: Date | null }[]> =
      {};
    for (const e of events) {
      if (!byAgent[e.agentName]) byAgent[e.agentName] = [];
      byAgent[e.agentName].push({
        eventType: e.eventType,
        count: e._count._all,
        lastSeen: e._max.createdAt,
      });
    }
    return byAgent;
  }

  async getRecentEvents(limit = 50) {
    return this.prisma.agentEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
