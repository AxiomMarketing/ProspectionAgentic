import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly jwtService: JwtService) {}

  async generateTokens(user: { id: string; email: string; roles: string[] }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    // TODO: Store jti in Redis for revocation support
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, jti: randomUUID() },
      { expiresIn: '7d' },
    );

    this.logger.log({ msg: 'Tokens generated', userId: user.id });

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  async validateRefreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      return { id: payload.sub, email: payload.email, roles: payload.roles };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
