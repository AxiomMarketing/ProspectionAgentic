import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private validKeys: string[];

  constructor(private configService: ConfigService) {
    const keys = this.configService.get<string>('INTERNAL_API_KEYS', '');
    this.validKeys = keys.split(',').map((k) => k.trim()).filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const apiKey =
      (request.headers['x-api-key'] as string) ||
      this.extractBearerToken(request);

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const isValid = this.validKeys.some((k) => {
      if (k.length !== apiKey.length) return false;
      return timingSafeEqual(Buffer.from(k), Buffer.from(apiKey));
    });
    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
