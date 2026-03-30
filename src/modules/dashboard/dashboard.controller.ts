import { Controller, Get, Param, Post, Query, Sse } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Observable, interval, map } from 'rxjs';
import { Roles } from '@common/decorators/roles.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles('admin', 'manager', 'viewer')
  @Get('metrics')
  async getMetrics() {
    return this.dashboardService.getPipelineMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents')
  async getAgentStatuses() {
    return this.dashboardService.getAgentStatuses();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('events')
  async getRecentEvents(@Query('limit') limit?: string) {
    return this.dashboardService.getRecentEvents(limit ? parseInt(limit, 10) : 50);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/:name/events')
  async getAgentEvents(
    @Param('name') name: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getAgentEvents(name, limit ? parseInt(limit, 10) : 100);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('action-items')
  async getActionItems() {
    return this.dashboardService.getPendingActionItems();
  }

  @Roles('admin', 'manager')
  @Post('agents/:name/trigger')
  async triggerAgent(@Param('name') name: string) {
    return this.dashboardService.triggerAgent(name);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/veilleur/sub-agents')
  async getVeilleurSubAgentStatus() {
    return this.dashboardService.getVeilleurSubAgentStatus();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/enrichisseur/metrics')
  async getEnrichisseurMetrics() {
    return this.dashboardService.getEnrichisseurMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/enrichisseur/sub-agents')
  async getEnrichisseurSubAgentStatus() {
    return this.dashboardService.getEnrichisseurSubAgentStatus();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/scoreur/metrics')
  async getScoreurMetrics() {
    return this.dashboardService.getScoreurMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/redacteur/metrics')
  async getRedacteurMetrics() {
    return this.dashboardService.getRedacteurMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/suiveur/metrics')
  async getSuiveurMetrics() {
    return this.dashboardService.getSuiveurMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/veilleur/report')
  async getVeilleurReport(@Query('date') date?: string) {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return this.dashboardService.getVeilleurReport(d);
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('tenders')
  async getTenders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getTenders(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('agents/nurtureur/metrics')
  @Roles('admin', 'manager', 'viewer')
  async getNurtureurMetrics() {
    return this.dashboardService.getNurtureurMetrics();
  }

  @Get('agents/analyste/metrics')
  @Roles('admin', 'manager', 'viewer')
  async getAnalysteMetrics() {
    return this.dashboardService.getAnalysteMetrics();
  }

  @Get('agents/dealmaker/metrics')
  @Roles('admin', 'manager', 'viewer')
  async getDealmakerMetrics() {
    return this.dashboardService.getDealmakerMetrics();
  }

  @Get('agents/appels-offres/metrics')
  @Roles('admin', 'manager', 'viewer')
  async getAppelsOffresMetrics() {
    return this.dashboardService.getAppelsOffresMetrics();
  }

  @Get('agents/csm/metrics')
  @Roles('admin', 'manager', 'viewer')
  async getCsmMetrics() {
    return this.dashboardService.getCsmMetrics();
  }

  @Roles('admin', 'manager', 'viewer')
  @Get('agents/graph')
  async getAgentGraph() {
    return this.dashboardService.getAgentGraph();
  }

  @Roles('admin', 'manager', 'viewer')
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
