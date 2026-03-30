import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import { DomainExceptionFilter } from '@common/filters/domain-exception.filter';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { TransformInterceptor } from '@common/interceptors/transform.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';
import { Reflector } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Pino logger
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Cookie parser (must be before routes)
  app.use(cookieParser());

  // CORS
  const allowedOrigins = configService.get<string>('ALLOWED_ORIGINS', 'http://localhost:5173');
  app.enableCors({
    origin: allowedOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id'],
    maxAge: 3600,
  });

  // Body parser limits
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  // Global exception filters (order: domain-specific first, then catch-all)
  app.useGlobalFilters(new GlobalExceptionFilter(), new DomainExceptionFilter());

  // Global interceptors (order: logging → transform → timeout)
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new TimeoutInterceptor(reflector),
  );

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: [],
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  // Start server
  const port = configService.get<number>('APP_PORT', 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
  logger.log(`Environment: ${configService.get('NODE_ENV', 'development')}`, 'Bootstrap');

  const services = [
    { name: 'Claude API', key: 'ANTHROPIC_API_KEY', available: !!configService.get('ANTHROPIC_API_KEY') },
    { name: 'Langfuse', key: 'LANGFUSE_PUBLIC_KEY', available: !!configService.get('LANGFUSE_PUBLIC_KEY') },
    { name: 'Gmail', key: 'GMAIL_CLIENT_ID', available: !!configService.get('GMAIL_CLIENT_ID') },
    { name: 'INSEE SIRENE', key: 'SIRENE_API_TOKEN', available: !!configService.get('SIRENE_API_TOKEN') },
    { name: 'INPI/RNE', key: 'INPI_USERNAME', available: !!configService.get('INPI_USERNAME') },
    { name: 'Reacher', key: 'REACHER_URL', available: !!configService.get('REACHER_URL') },
    { name: 'Slack', key: 'SLACK_WEBHOOK_URL', available: !!configService.get('SLACK_WEBHOOK_URL') },
  ];

  const active = services.filter(s => s.available).map(s => s.name);
  const inactive = services.filter(s => !s.available).map(s => `${s.name} (${s.key})`);

  logger.log(`Services active: ${active.join(', ') || 'none'}`, 'Bootstrap');
  if (inactive.length > 0) {
    logger.warn(`Services inactive (set env vars to enable): ${inactive.join(', ')}`, 'Bootstrap');
  }
}

bootstrap();
