import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || exception.message;
      code = (exceptionResponse as any).code || `HTTP_${statusCode}`;
    } else if (exception instanceof Error) {
      message = this.isProduction ? 'Internal server error' : exception.message;
    }

    this.logger.error({
      msg: 'Unhandled exception',
      statusCode,
      code,
      path: request.url,
      method: request.method,
      ...((!this.isProduction && exception instanceof Error) ? { stack: exception.stack } : {}),
    });

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...((!this.isProduction && exception instanceof Error) ? { stack: exception.stack } : {}),
    });
  }
}
