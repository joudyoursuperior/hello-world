import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SafeUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  clinicId: string;
  isActive: boolean;
  invitedAt: Date | null;
  invitationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

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

  getUserById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSafeSelect,
    });
  }

  listClinicUsers(clinicId: string): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      where: { clinicId },
      select: userSafeSelect,
    });
  }
}
