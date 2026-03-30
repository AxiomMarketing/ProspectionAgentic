import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailAdapter } from '@common/ports/i-email.adapter';
import { GmailAdapter } from './adapters/gmail.adapter';
import { StubEmailAdapter } from '@common/adapters/stub-email.adapter';

@Module({
  providers: [
    {
      provide: IEmailAdapter,
      useFactory: (configService: ConfigService) => {
        const clientId = configService.get<string>('GMAIL_CLIENT_ID');
        if (clientId) {
          return new GmailAdapter(configService);
        }
        return new StubEmailAdapter();
      },
      inject: [ConfigService],
    },
  ],
  exports: [IEmailAdapter],
})
export class EmailModule {}
