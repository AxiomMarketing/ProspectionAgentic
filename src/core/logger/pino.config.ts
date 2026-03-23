import { Params } from 'nestjs-pino';

export const pinoConfig = (): Params => ({
  pinoHttp: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
        : undefined,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.passwordHash',
        'body.token',
        'body.accessToken',
        'body.refreshToken',
        'body.apiKey',
        'body.secret',
        'body.creditCard',
        'body.email',
        'body.phone',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (req: any) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res: any) => ({
        statusCode: res.statusCode,
      }),
    },
  },
});
