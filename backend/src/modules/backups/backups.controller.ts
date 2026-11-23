import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { RestoreBackupDto } from './dto/backup.dto';
import { BackupsService } from './backups.service';

@Controller('backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class BackupsController {
  constructor(
    private service: BackupsService,
    private audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  async create(@CurrentUser() user: AuthUser) {
    const result = await this.service.create();
    await this.audit.log({
      userId: user?.userId,
      action: 'backup.create',
      entity: 'backup',
      entityId: result.name,
    });
    return result;
  }

  @Get(':name/download')
  async download(@Param('name') name: string, @Res() res: any) {
    const file = await this.service.read(name);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(file);
  }

  @Delete(':name')
  async remove(@Param('name') name: string, @CurrentUser() user: AuthUser) {
    const result = await this.service.remove(name);
    await this.audit.log({
      userId: user?.userId,
      action: 'backup.delete',
      entity: 'backup',
      entityId: name,
    });
    return result;
  }

  @Post(':name/restore')
  async restore(
    @Param('name') name: string,
    @Body() body: RestoreBackupDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (body.confirm !== true) throw new BadRequestException('Confirmation required');
    const result = await this.service.restore(name);
    await this.audit.log({
      userId: user?.userId,
      action: 'backup.restore',
      entity: 'backup',
      entityId: name,
      metadata: { confirm: true },
    });
    return result;
  }
}
