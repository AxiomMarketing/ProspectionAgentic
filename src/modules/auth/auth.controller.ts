import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  NotImplementedException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { Public } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

type LoginDto = z.infer<typeof LoginSchema>;
type RefreshDto = z.infer<typeof RefreshSchema>;

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto) {
    throw new NotImplementedException('Authentication not yet implemented');
    // TODO: Implement actual user lookup and password verification
    // const user = { id: 'stub-user-id', email: body.email, roles: ['admin'] };
    // return this.authService.generateTokens(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    const user = await this.authService.validateRefreshToken(body.refreshToken);
    return this.authService.generateTokens(user);
  }
}
