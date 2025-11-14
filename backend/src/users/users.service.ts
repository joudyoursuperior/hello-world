import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  listClinicUsers(clinicId: string) {
    return this.prisma.user.findMany({ where: { clinicId } });
  }
}
