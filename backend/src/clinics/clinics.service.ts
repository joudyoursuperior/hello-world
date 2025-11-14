import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  getClinicById(id: string) {
    return this.prisma.clinic.findUnique({ where: { id } });
  }

  async updateClinic(clinicId: string, dto: UpdateClinicDto) {
    const clinic = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: dto,
    });
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }
    return clinic;
  }
}
