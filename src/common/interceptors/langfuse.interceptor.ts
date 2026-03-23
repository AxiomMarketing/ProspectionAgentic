import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { LANGFUSE_TRACE_KEY } from '@common/decorators/langfuse-trace.decorator';
import { Request } from 'express';

@Injectable()
export class LangfuseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LangfuseInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const traceName = this.reflector.get<string>(LANGFUSE_TRACE_KEY, context.getHandler());
    if (!traceName) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    // TODO: Initialize Langfuse trace when Langfuse SDK is integrated
    this.logger.debug({
      msg: 'Langfuse trace started',
      traceName,
      path: request.url,
      method: request.method,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          this.logger.debug({
            msg: 'Langfuse trace completed',
            traceName,
            durationMs,
            status: 'success',
          });
        },
        error: (error) => {
          const durationMs = Date.now() - startTime;
          this.logger.warn({
            msg: 'Langfuse trace error',
            traceName,
            durationMs,
            error: error?.message,
          });
        },
      }),
    );
  }
}
