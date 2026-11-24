import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VerifyUpdateDto } from './dto/verify-update.dto';
import { UpdatesService } from './updates.service';

@Controller('updates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UpdatesController {
  constructor(private service: UpdatesService) {}

  @Post('verify')
  @Roles(Role.ADMIN)
  verify(@Body() dto: VerifyUpdateDto) {
    return this.service.verify(dto);
  }
}
