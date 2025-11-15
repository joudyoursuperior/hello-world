import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const userSafeSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  clinicId: true,
  isActive: true,
  invitedAt: true,
  invitationId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSafeSelect,
    });
  }

  listClinicUsers(clinicId: string) {
    return this.prisma.user.findMany({
      where: { clinicId },
      select: userSafeSelect,
    });
  }
}
