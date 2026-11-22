import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const token = await this.auth.login({ sub: body.email, role: 'ADMIN' });
    return token;
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    const payload = this.auth.verifyToken(body.refreshToken);
    return this.auth.login({ sub: payload.sub, role: payload.role });
  }
}