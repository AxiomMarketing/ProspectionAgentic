import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppelsOffresService {
  private readonly logger = new Logger(AppelsOffresService.name);
}
