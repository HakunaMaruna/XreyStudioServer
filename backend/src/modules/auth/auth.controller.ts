import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';

// This cookie is only a routing marker for the optional decoy page. Authorization
// is still performed by JWT on every /api request; the cookie grants no access.
export const UI_ACCESS_COOKIE = 'xss_ui_access';

function setUiCookie(res: Response) {
  if (process.env.PANEL_DECOY !== 'true') return;
  res.cookie(UI_ACCESS_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearUiCookie(res: Response) {
  res.clearCookie(UI_ACCESS_COOKIE, { path: '/' });
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    setUiCookie(res);
    return this.auth.login(dto);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    setUiCookie(res);
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    clearUiCookie(res);
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
