import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';

@UseGuards(JwtAuthGuard)
@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get('me')
  getMyClinic(@CurrentUser() user: any) {
    return this.clinicsService.getClinicById(user.clinicId);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  updateClinic(@CurrentUser() user: any, @Body() dto: UpdateClinicDto) {
    return this.clinicsService.updateClinic(user.clinicId, dto);
  }
}
