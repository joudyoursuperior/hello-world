import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { UserRole } from '../common/enums/user-role.enum';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { addHours, isBefore } from 'date-fns';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.ownerEmail } });
    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }
    const clinic = await this.prisma.clinic.create({
      data: {
        name: dto.clinicName,
        users: {
          create: {
            email: dto.ownerEmail,
            fullName: dto.ownerName,
            passwordHash: await bcrypt.hash(dto.password, 10),
            role: UserRole.OWNER,
          },
        },
      },
      include: { users: true },
    });
    const owner = clinic.users[0];
    return this.generateToken(owner);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.generateToken(user);
  }

  async inviteStaff(clinicId: string, creatorId: string, dto: InviteStaffDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    const token = this.generateInviteToken();
    const expiryHours = this.config.get<number>('invites.expiryHours', 72);
    const expiresAt = addHours(new Date(), expiryHours);

    const invitation = await this.prisma.staffInvitation.create({
      data: {
        clinicId,
        email: dto.email,
        role: dto.role,
        token,
        expiresAt,
        createdById: creatorId,
      },
    });

    return {
      invitationId: invitation.id,
      token: invitation.token,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(dto: AcceptInviteDto) {
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { token: dto.token } });
    if (!invitation) {
      throw new BadRequestException('Invalid invitation token');
    }
    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation already used');
    }
    if (isBefore(invitation.expiresAt, new Date())) {
      throw new ForbiddenException('Invitation expired');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: invitation.email,
        fullName: dto.fullName,
        passwordHash,
        role: invitation.role,
        clinicId: invitation.clinicId,
        invitedAt: new Date(),
        invitation: { connect: { id: invitation.id } },
      },
    });

    await this.prisma.staffInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return this.generateToken(user);
  }

  private generateInviteToken() {
    // 48 cryptographically secure random bytes yields a 64-character URL-safe token
    // that is sufficiently resistant to brute-force guessing.
    return randomBytes(48).toString('base64url');
  }

  private generateToken(user: { id: string; clinicId: string; role: UserRole; email: string; fullName: string }) {
    const payload = {
      sub: user.id,
      clinicId: user.clinicId,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: payload,
    };
  }
}
