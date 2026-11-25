import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SnapshotBefore } from '../snapshots/snapshot-before.decorator';
import { AuditService } from '../audit/audit.service';
import { ApplyUpdateDto } from './dto/apply-update.dto';
import { VerifyUpdateDto } from './dto/verify-update.dto';
import { UpdatesService } from './updates.service';

@Controller('updates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UpdatesController {
  constructor(
    private service: UpdatesService,
    private audit: AuditService,
  ) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.OPERATOR)
  status(@CurrentUser() user: AuthUser) {
    return this.service.status(false, user.role === Role.ADMIN);
  }

  @Post('check')
  @Roles(Role.ADMIN)
  check(@CurrentUser() user: AuthUser) {
    return this.service.status(true, user.role === Role.ADMIN);
  }

  @Post('apply')
  @SnapshotBefore('update', 'Panel update apply')
  @Roles(Role.ADMIN)
  async apply(@Body() dto: ApplyUpdateDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.service.apply(dto?.targetVersion);
    await this.audit.log({
      userId: user.userId,
      action: 'update.apply',
      entity: 'Panel',
      ip: req.ip,
    });
    return result;
  }

  @Post('verify')
  @Roles(Role.ADMIN)
  verify(@Body() dto: VerifyUpdateDto) {
    return this.service.verify(dto);
  }
}
