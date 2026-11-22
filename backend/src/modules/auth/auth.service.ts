import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../../common/password.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private passwords: PasswordService,
  ) {}

  async hashPassword(password: string) {
    return this.passwords.hash(password);
  }

  async verifyPassword(password: string, stored: string) {
    return this.passwords.verify(password, stored);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    role: string;
    organizationId: string | null;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organizationId,
    };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, type: 'refresh', jti: randomBytes(16).toString('hex') },
      { expiresIn: '7d' },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }
    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Subscription expired');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User unavailable');
    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Subscription expired');
    }
    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
    return { success: true };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        trafficLimit: true,
        trafficUsed: true,
        expiresAt: true,
        subscriptionToken: true,
        organizationId: true,
        createdAt: true,
      },
    });
  }
}
