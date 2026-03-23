import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AnalysteService {
  private readonly logger = new Logger(AnalysteService.name);
}
