import { Controller, Get, Query, Sse } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Observable, interval, map } from 'rxjs';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  async getMetrics() {
    return this.dashboardService.getPipelineMetrics();
  }

  @Get('agents')
  async getAgentStatuses() {
    return this.dashboardService.getAgentStatuses();
  }

  @Get('events')
  async getRecentEvents(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentEvents(limit ? parseInt(limit, 10) : 50);
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return interval(10000).pipe(
      map(
        () =>
          ({ data: { type: 'heartbeat', timestamp: new Date().toISOString() } }) as MessageEvent,
      ),
    );
  }
}
