import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { LANGFUSE_TRACE_KEY } from '@common/decorators/langfuse-trace.decorator';
import { Request } from 'express';

// Dynamic import — Langfuse is optional
let LangfuseSDK: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LangfuseSDK = require('langfuse').Langfuse;
} catch (_e) { /* langfuse not installed — tracing disabled */ }

@Injectable()
export class LangfuseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LangfuseInterceptor.name);
  private client: any = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    const publicKey = this.configService.get<string>('LANGFUSE_PUBLIC_KEY');
    const secretKey = this.configService.get<string>('LANGFUSE_SECRET_KEY');
    const host = this.configService.get<string>('LANGFUSE_HOST');

    if (publicKey && secretKey && LangfuseSDK) {
      this.client = new LangfuseSDK({ publicKey, secretKey, baseUrl: host, flushAt: 20, flushInterval: 5000 });
      this.logger.log('Langfuse tracing enabled');
    } else {
      this.logger.warn('Langfuse tracing disabled (missing credentials or package)');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.client) return next.handle();

    const traceName = this.reflector.get<string>(LANGFUSE_TRACE_KEY, context.getHandler());
    if (!traceName) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const trace = this.client.trace({
      name: traceName,
      metadata: { method: request.method, path: request.url, userAgent: request.headers['user-agent'] },
      tags: ['api-request'],
    });

    const startTime = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          trace.update({ output: { duration: Date.now() - startTime, status: 'success' } });
        },
        error: (error: Error) => {
          trace.update({ output: { duration: Date.now() - startTime, status: 'error', error: error.message } });
        },
      }),
    );
  }
}
