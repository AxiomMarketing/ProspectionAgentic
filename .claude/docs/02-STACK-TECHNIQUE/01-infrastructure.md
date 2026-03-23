# Infrastructure Technique

## Vue d'ensemble

L'infrastructure repose sur Node.js 22.22.1 LTS, NestJS 11, TypeScript 5.9, déployée sur un VPS Hetzner avec Docker Compose. Caddy assure le reverse proxy avec TLS automatique.

---

## Node.js 22.22.1 LTS

### Installation via nvm (recommandé)

```bash
# Installer nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recharger le shell
source ~/.bashrc

# Installer Node.js 22 LTS
nvm install 22.22.1
nvm use 22.22.1
nvm alias default 22.22.1

# Vérification
node --version  # v22.22.1
npm --version   # 10.x
```

### Configuration système Node.js

```ini
# /etc/sysctl.d/99-nodejs.conf
# Augmenter les limites pour les connexions réseau
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
fs.file-max = 1000000
```

```bash
# /etc/security/limits.conf
*    soft nofile 65535
*    hard nofile 65535
root soft nofile 65535
root hard nofile 65535
```

### package.json racine

```json
{
  "name": "prospection-agentic",
  "version": "1.0.0",
  "description": "Multi-agent AI prospection system",
  "engines": {
    "node": ">=22.22.1",
    "npm": ">=10.0.0"
  },
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.17",
    "@nestjs/core": "^11.1.17",
    "@nestjs/platform-express": "^11.1.17",
    "@nestjs/config": "^4.0.0",
    "@nestjs/bull": "^11.0.0",
    "@nestjs/throttler": "^6.0.0",
    "@nestjs/terminus": "^11.0.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "@prisma/client": "^7.4.0",
    "bullmq": "^5.71.0",
    "pino": "^10.3.1",
    "pino-http": "^10.0.0",
    "redis": "^4.7.0",
    "zod": "^3.23.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0",
    "helmet": "^8.0.0",
    "express-rate-limit": "^7.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.17",
    "@types/node": "^22.0.0",
    "@types/jest": "^29.5.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "jest": "^29.7.0",
    "prisma": "^7.4.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.9.0"
  }
}
```

---

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "strict": true,
    "paths": {
      "@modules/*": ["src/modules/*"],
      "@shared/*": ["src/shared/*"],
      "@config/*": ["src/config/*"],
      "@domain/*": ["src/domain/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"]
}
```

### tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"]
}
```

---

## Structure NestJS 11

### Arborescence complète

```
src/
├── main.ts                          # Point d'entrée, bootstrap
├── app.module.ts                    # Module racine
├── config/
│   ├── app.config.ts               # Configuration globale (Zod validated)
│   ├── database.config.ts          # PostgreSQL / Prisma
│   ├── redis.config.ts             # Redis / BullMQ
│   ├── llm.config.ts               # Claude API
│   └── external-apis.config.ts    # APIs externes
├── domain/
│   ├── prospect/
│   │   ├── prospect.entity.ts
│   │   ├── prospect.value-objects.ts
│   │   └── prospect.events.ts
│   ├── scoring/
│   │   ├── scoring.entity.ts
│   │   └── scoring.rules.ts
│   └── sequence/
│       ├── sequence.entity.ts
│       └── sequence.state-machine.ts
├── modules/
│   ├── agents/
│   │   ├── agents.module.ts
│   │   ├── discovery/
│   │   │   ├── discovery-agent.service.ts
│   │   │   ├── discovery-agent.processor.ts
│   │   │   └── discovery-agent.dto.ts
│   │   ├── scoring/
│   │   │   ├── scoring-agent.service.ts
│   │   │   ├── scoring-agent.processor.ts
│   │   │   └── scoring-agent.dto.ts
│   │   ├── enrichment/
│   │   │   ├── enrichment-agent.service.ts
│   │   │   └── enrichment-agent.processor.ts
│   │   ├── personalization/
│   │   │   ├── personalization-agent.service.ts
│   │   │   └── personalization-agent.processor.ts
│   │   ├── outreach/
│   │   │   ├── outreach-agent.service.ts
│   │   │   └── outreach-agent.processor.ts
│   │   ├── reply/
│   │   │   ├── reply-agent.service.ts
│   │   │   └── reply-agent.processor.ts
│   │   ├── nurture/
│   │   │   ├── nurture-agent.service.ts
│   │   │   └── nurture-agent.processor.ts
│   │   └── dce/
│   │       ├── dce-agent.service.ts
│   │       └── dce-agent.processor.ts
│   ├── prospects/
│   │   ├── prospects.module.ts
│   │   ├── prospects.controller.ts
│   │   ├── prospects.service.ts
│   │   └── dto/
│   │       ├── create-prospect.dto.ts
│   │       └── update-prospect.dto.ts
│   ├── scoring/
│   │   ├── scoring.module.ts
│   │   ├── scoring.service.ts
│   │   └── scoring.repository.ts
│   ├── sequences/
│   │   ├── sequences.module.ts
│   │   ├── sequences.service.ts
│   │   └── sequences.controller.ts
│   ├── llm/
│   │   ├── llm.module.ts
│   │   ├── llm.service.ts           # Router Haiku/Sonnet/Opus
│   │   ├── prompt-cache.service.ts
│   │   └── cost-tracker.service.ts
│   ├── webhooks/
│   │   ├── webhooks.module.ts
│   │   ├── webhooks.controller.ts   # n8n inbound webhooks
│   │   └── webhooks.guard.ts        # HMAC validation
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts
├── shared/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── redis/
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── guards/
│   │   ├── api-key.guard.ts
│   │   └── rate-limit.guard.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   ├── timeout.interceptor.ts
│   │   └── transform.interceptor.ts
│   ├── filters/
│   │   └── global-exception.filter.ts
│   └── pipes/
│       └── validation.pipe.ts
└── infrastructure/
    ├── external-apis/
    │   ├── boamp.client.ts
    │   ├── insee.client.ts
    │   ├── dropcontact.client.ts
    │   ├── hunter.client.ts
    │   └── zerobounce.client.ts
    └── queues/
        ├── queue.constants.ts
        └── queue.module.ts
```

### main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { createLogger } from './config/logger.config';
import helmet from 'helmet';

async function bootstrap() {
  const logger = createLogger();

  const app = await NestFactory.create(AppModule, {
    logger: logger,
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // CORS — strict en production
  const allowedOrigins = configService
    .get<string>('app.allowedOrigins', '')
    .split(',')
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  });

  // API versioning
  app.enableVersioning({ type: VersioningType.URI });
  app.setGlobalPrefix(apiPrefix);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(logger),
    new TransformInterceptor(),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter(logger));

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
```

### app.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import llmConfig from './config/llm.config';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { AgentsModule } from './modules/agents/agents.module';
import { ProspectsModule } from './modules/prospects/prospects.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { SequencesModule } from './modules/sequences/sequences.module';
import { LlmModule } from './modules/llm/llm.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, llmConfig],
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 60000, limit: 200 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),
    BullModule.forRootAsync({
      useFactory: (config) => ({
        connection: {
          host: config.get('redis.host'),
          port: config.get('redis.port'),
          password: config.get('redis.password'),
          tls: config.get('redis.tls') ? {} : undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 1000, age: 86400 },
          removeOnFail: { count: 5000, age: 604800 },
        },
      }),
      inject: ['ConfigService'],
    }),
    TerminusModule,
    PrismaModule,
    RedisModule,
    AgentsModule,
    ProspectsModule,
    ScoringModule,
    SequencesModule,
    LlmModule,
    WebhooksModule,
    HealthModule,
  ],
})
export class AppModule {}
```

---

## Guards

### api-key.guard.ts

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual, createHash } from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key required');
    }

    const validKey = this.configService.get<string>('app.apiKey');
    if (!validKey) {
      throw new UnauthorizedException('API key not configured');
    }

    // Timing-safe comparison to prevent timing attacks
    const incoming = createHash('sha256').update(apiKey).digest();
    const expected = createHash('sha256').update(validKey).digest();

    if (!timingSafeEqual(incoming, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
```

### webhooks.guard.ts (HMAC validation pour n8n)

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhookHmacGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-webhook-signature'];
    const secret = this.configService.get<string>('app.webhookSecret');

    if (!secret) return false;
    if (!signature || typeof signature !== 'string') {
      throw new UnauthorizedException('Webhook signature required');
    }

    const rawBody = (request as any).rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw body unavailable');
    }

    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
```

---

## Interceptors

### logging.interceptor.ts

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    const start = Date.now();

    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    const { method, url, ip } = request;

    this.logger.log({
      event: 'http_request',
      requestId,
      method,
      url,
      ip,
    });

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          event: 'http_response',
          requestId,
          method,
          url,
          statusCode: response.statusCode,
          durationMs: Date.now() - start,
        });
      }),
      catchError((error) => {
        this.logger.error({
          event: 'http_error',
          requestId,
          method,
          url,
          durationMs: Date.now() - start,
          error: error.message,
        });
        return throwError(() => error);
      }),
    );
  }
}
```

### timeout.interceptor.ts

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 30000) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
```

---

## Docker Compose

### docker-compose.yml

```yaml
version: '3.9'

networks:
  prospection-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

volumes:
  postgres_data:
  redis_data:
  n8n_data:
  langfuse_data:
  metabase_data:
  caddy_data:
  caddy_config:

services:
  # ─── Application NestJS ──────────────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: prospection-app
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      APP_PORT: 3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: '50m'
        max-file: '5'

  # ─── PostgreSQL 16 ────────────────────────────────────────────────────────
  postgres:
    image: postgres:16.3-alpine
    container_name: prospection-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infrastructure/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./infrastructure/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
    logging:
      driver: json-file
      options:
        max-size: '20m'
        max-file: '3'

  # ─── Redis 7.4.3 ─────────────────────────────────────────────────────────
  redis:
    image: redis:7.4.3-alpine
    container_name: prospection-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 1gb
      --maxmemory-policy noeviction
      --appendonly yes
      --appendfsync everysec
      --save 3600 1
      --save 300 100
      --save 60 10000
      --loglevel notice
    volumes:
      - redis_data:/data
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1.5G

  # ─── n8n ─────────────────────────────────────────────────────────────────
  n8n:
    image: n8nio/n8n:1.123.17
    container_name: prospection-n8n
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: ${N8N_DB_NAME}
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_HOST: n8n.${DOMAIN}
      N8N_PROTOCOL: https
      N8N_WEBHOOK_URL: https://n8n.${DOMAIN}/
      WEBHOOK_URL: https://n8n.${DOMAIN}/
      N8N_BASIC_AUTH_ACTIVE: 'true'
      N8N_BASIC_AUTH_USER: ${N8N_BASIC_AUTH_USER}
      N8N_BASIC_AUTH_PASSWORD: ${N8N_BASIC_AUTH_PASSWORD}
      N8N_METRICS: 'true'
      N8N_LOG_LEVEL: info
      EXECUTIONS_DATA_PRUNE: 'true'
      EXECUTIONS_DATA_MAX_AGE: 336
      N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true'
      N8N_DISABLE_PRODUCTION_MAIN_PROCESS: 'false'
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:5678/healthz']
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── Langfuse v3.143 ─────────────────────────────────────────────────────
  langfuse-web:
    image: langfuse/langfuse:3.143
    container_name: prospection-langfuse-web
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${LANGFUSE_DB_NAME}
      NEXTAUTH_URL: https://langfuse.${DOMAIN}
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES: 'false'
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/public/health']
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── Metabase 0.59.1.6 ───────────────────────────────────────────────────
  metabase:
    image: metabase/metabase:v0.59.1.6
    container_name: prospection-metabase
    restart: unless-stopped
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: ${METABASE_DB_NAME}
      MB_DB_PORT: 5432
      MB_DB_USER: ${POSTGRES_USER}
      MB_DB_PASS: ${POSTGRES_PASSWORD}
      MB_DB_HOST: postgres
      MB_SITE_URL: https://metabase.${DOMAIN}
      MB_EMBEDDING_SECRET_KEY: ${METABASE_EMBEDDING_KEY}
    volumes:
      - metabase_data:/metabase-data
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - prospection-net
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/health']
      interval: 60s
      timeout: 15s
      retries: 3

  # ─── Bull Board (BullMQ UI) ───────────────────────────────────────────────
  bull-board:
    build:
      context: ./infrastructure/bull-board
      dockerfile: Dockerfile
    container_name: prospection-bull-board
    restart: unless-stopped
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      BULL_BOARD_PORT: 3001
      BULL_BOARD_USER: ${BULL_BOARD_USER}
      BULL_BOARD_PASSWORD: ${BULL_BOARD_PASSWORD}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - prospection-net

  # ─── Caddy 2.11.2 ────────────────────────────────────────────────────────
  caddy:
    image: caddy:2.11.2-alpine
    container_name: prospection-caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./infrastructure/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      DOMAIN: ${DOMAIN}
      CADDY_ADMIN: 'off'
    networks:
      - prospection-net
    depends_on:
      - app
    healthcheck:
      test: ['CMD', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile']
      interval: 60s
      timeout: 10s
      retries: 3
```

### Dockerfile

```dockerfile
# ─── Build stage ─────────────────────────────────────────────────────────
FROM node:22.22.1-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev)
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npm run prisma:generate

# Build
RUN npm run build

# ─── Production stage ────────────────────────────────────────────────────
FROM node:22.22.1-alpine AS production

WORKDIR /app

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && npm run prisma:generate

# Copy built application
COPY --from=builder /app/dist ./dist

# Set permissions
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]
```

---

## Caddy Reverse Proxy

### Caddyfile

```caddyfile
# /infrastructure/caddy/Caddyfile
{
  email admin@{$DOMAIN}
  admin off

  # Sécurité globale
  servers {
    trusted_proxies static 172.20.0.0/16
    client_ip_headers X-Forwarded-For X-Real-IP
  }
}

# ─── Application principale ──────────────────────────────────────────────
{$DOMAIN} {
  reverse_proxy app:3000 {
    health_uri /api/health
    health_interval 30s
    health_timeout 10s
    health_status 200

    transport http {
      dial_timeout 5s
      response_header_timeout 30s
    }
  }

  # Headers de sécurité
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    X-XSS-Protection "1; mode=block"
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'"
    -Server
    -X-Powered-By
  }

  # Rate limiting applicatif
  rate_limit {
    zone dynamic {
      key {remote_host}
      events 100
      window 1m
    }
  }

  # Compression
  encode {
    gzip
    zstd
  }

  log {
    output file /var/log/caddy/access.log {
      roll_size 50mb
      roll_keep 5
    }
    format json
  }
}

# ─── n8n ─────────────────────────────────────────────────────────────────
n8n.{$DOMAIN} {
  # Restriction IP pour n8n (internes uniquement)
  @blocked not remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 {$ADMIN_IP}
  respond @blocked 403

  reverse_proxy n8n:5678

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options SAMEORIGIN
    X-Content-Type-Options nosniff
    -Server
  }
}

# ─── Langfuse ─────────────────────────────────────────────────────────────
langfuse.{$DOMAIN} {
  @blocked not remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 {$ADMIN_IP}
  respond @blocked 403

  reverse_proxy langfuse-web:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options SAMEORIGIN
    X-Content-Type-Options nosniff
    -Server
  }
}

# ─── Metabase ─────────────────────────────────────────────────────────────
metabase.{$DOMAIN} {
  @blocked not remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 {$ADMIN_IP}
  respond @blocked 403

  reverse_proxy metabase:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options SAMEORIGIN
    X-Content-Type-Options nosniff
    -Server
  }
}

# ─── Bull Board ──────────────────────────────────────────────────────────
queues.{$DOMAIN} {
  @blocked not remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 {$ADMIN_IP}
  respond @blocked 403

  reverse_proxy bull-board:3001

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options DENY
    -Server
  }

  basicauth {
    {$BULL_BOARD_USER} {$BULL_BOARD_PASSWORD_HASH}
  }
}
```

---

## Hetzner VPS Setup

### Provisionnement initial

```bash
#!/bin/bash
# /infrastructure/scripts/provision-vps.sh
# À exécuter en root juste après la création du VPS Hetzner

set -euo pipefail

DEPLOY_USER="deploy"
DEPLOY_KEY_PATH="$1"  # Chemin vers la clé SSH publique

if [ -z "$DEPLOY_KEY_PATH" ]; then
  echo "Usage: $0 <path-to-public-key>"
  exit 1
fi

# ─── Mise à jour système ──────────────────────────────────────────────────
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip \
  ufw fail2ban \
  htop iotop ncdu \
  logrotate \
  ca-certificates gnupg lsb-release

# ─── Utilisateur deploy ───────────────────────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash -G sudo "$DEPLOY_USER"
  mkdir -p /home/${DEPLOY_USER}/.ssh
  cat "$DEPLOY_KEY_PATH" > /home/${DEPLOY_USER}/.ssh/authorized_keys
  chmod 700 /home/${DEPLOY_USER}/.ssh
  chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys
  chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh
fi

# Sudo sans mot de passe pour docker
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, /usr/local/bin/docker-compose" \
  > /etc/sudoers.d/${DEPLOY_USER}

# ─── Durcissement SSH ──────────────────────────────────────────────────────
cat > /etc/ssh/sshd_config.d/99-hardening.conf << 'EOF'
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PermitEmptyPasswords no
X11Forwarding no
AllowTcpForwarding no
GatewayPorts no
PermitTunnel no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy
Banner /etc/ssh/banner
EOF

echo "Authorized access only. All connections are logged." > /etc/ssh/banner
systemctl restart ssh

# ─── Pare-feu UFW ────────────────────────────────────────────────────────
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Caddy redirect)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3 QUIC'
ufw --force enable
ufw status verbose

# ─── Fail2ban ────────────────────────────────────────────────────────────
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = 22
maxretry = 3
bantime  = 86400

[http-auth]
enabled  = true
port     = http,https
maxretry = 10
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# ─── Swap (2GB) ──────────────────────────────────────────────────────────
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
fi

# ─── Kernel hardening ────────────────────────────────────────────────────
cat > /etc/sysctl.d/99-security.conf << 'EOF'
# IP hardening
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096

# Kernel hardening
kernel.randomize_va_space = 2
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
EOF

sysctl --system

echo "Provisioning complete. Reboot recommended."
```

### Configuration PostgreSQL optimisée

```ini
# /infrastructure/postgres/postgresql.conf
# Optimisé pour VPS Hetzner CX41 (8 vCPU, 16GB RAM)

# Connexions
max_connections = 100
superuser_reserved_connections = 3

# Mémoire
shared_buffers = 4GB            # 25% de la RAM
effective_cache_size = 12GB     # 75% de la RAM
work_mem = 64MB                 # Pour les tris/hash joins
maintenance_work_mem = 1GB      # Pour VACUUM, CREATE INDEX

# WAL
wal_level = replica
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9
wal_compression = on

# Performance
random_page_cost = 1.1          # SSD
effective_io_concurrency = 200  # NVMe SSD
default_statistics_target = 100
parallel_tuple_cost = 0.1
parallel_setup_cost = 1000
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

# Logging
logging_collector = on
log_destination = 'jsonlog'
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000  # Log queries > 1s
log_lock_waits = on
log_temp_files = 10MB
log_autovacuum_min_duration = 500

# Autovacuum
autovacuum = on
autovacuum_max_workers = 4
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02

# Extensions
shared_preload_libraries = 'pg_stat_statements,pg_prewarm'
pg_stat_statements.track = all
pg_stat_statements.max = 10000
```

---

## Configuration Pino Logger

### logger.config.ts

```typescript
import pino from 'pino';
import { ConfigService } from '@nestjs/config';

export function createLogger(configService?: ConfigService) {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

  return pino({
    level,
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          formatters: {
            level: (label) => ({ level: label }),
            bindings: () => ({}),
          },
          timestamp: pino.stdTimeFunctions.isoTime,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'body.password',
              'body.apiKey',
              'body.token',
            ],
            censor: '[REDACTED]',
          },
        }),
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        requestId: req.id,
        remoteAddress: req.remoteAddress,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });
}
```

---

## Variables d'environnement

### .env.example

```bash
# ─── Application ─────────────────────────────────────────────────────────
NODE_ENV=production
APP_PORT=3000
APP_API_KEY=your-secure-api-key-here
APP_WEBHOOK_SECRET=your-webhook-hmac-secret
DOMAIN=votre-domaine.com
ADMIN_IP=1.2.3.4
ALLOWED_ORIGINS=https://votre-domaine.com

# ─── PostgreSQL ───────────────────────────────────────────────────────────
POSTGRES_USER=prospection
POSTGRES_PASSWORD=strong-password-here
POSTGRES_DB=prospection_prod
N8N_DB_NAME=n8n_prod
LANGFUSE_DB_NAME=langfuse_prod
METABASE_DB_NAME=metabase_prod
DATABASE_URL=postgresql://prospection:strong-password-here@localhost:5432/prospection_prod

# ─── Redis ────────────────────────────────────────────────────────────────
REDIS_PASSWORD=strong-redis-password
REDIS_URL=redis://:strong-redis-password@localhost:6379

# ─── Claude API ───────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-...
LLM_MONTHLY_BUDGET_EUR=500
LLM_DAILY_BUDGET_EUR=25

# ─── n8n ─────────────────────────────────────────────────────────────────
N8N_ENCRYPTION_KEY=32-char-random-string
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=strong-n8n-password

# ─── Langfuse ────────────────────────────────────────────────────────────
LANGFUSE_NEXTAUTH_SECRET=32-char-random-string
LANGFUSE_SALT=16-char-random-string
LANGFUSE_ENCRYPTION_KEY=32-char-hex-string
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://langfuse.votre-domaine.com

# ─── Metabase ────────────────────────────────────────────────────────────
METABASE_EMBEDDING_KEY=32-char-random-string

# ─── Bull Board ──────────────────────────────────────────────────────────
BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=strong-bull-password
BULL_BOARD_PASSWORD_HASH=$2a$10$...  # bcrypt hash for Caddy

# ─── APIs externes ────────────────────────────────────────────────────────
DROPCONTACT_API_KEY=your-dropcontact-key
HUNTER_API_KEY=your-hunter-key
ZEROBOUNCE_API_KEY=your-zerobounce-key
KASPR_API_KEY=your-kaspr-key
PAPPERS_API_KEY=your-pappers-key
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token
MAILGUN_API_KEY=your-mailgun-key
MAILGUN_DOMAIN=mg.votre-domaine.com
SLACK_BOT_TOKEN=xoxb-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
YOUSIGN_API_KEY=your-yousign-key
TYPEFORM_API_KEY=your-typeform-key
WAALAXY_API_KEY=your-waalaxy-key

# ─── Observabilité ────────────────────────────────────────────────────────
LOG_LEVEL=info
SENTRY_DSN=https://...@sentry.io/...
```
