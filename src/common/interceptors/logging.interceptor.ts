import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, headers, ip } = request;

    const requestId = (headers['x-request-id'] as string) || uuidv4();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);

    const startTime = Date.now();

    this.logger.log({
      msg: 'Incoming request',
      requestId,
      method,
      path: url,
      userAgent: headers['user-agent'],
      ip,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          this.logger.log({
            msg: 'Request completed',
            requestId,
            method,
            path: url,
            statusCode: response.statusCode,
            durationMs,
          });
        },
        error: (error) => {
          const durationMs = Date.now() - startTime;
          this.logger.error({
            msg: 'Request failed',
            requestId,
            method,
            path: url,
            durationMs,
            errorName: error?.name,
            errorMessage: error?.message,
          });
        },
      }),
    );
  }
}
