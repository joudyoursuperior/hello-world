import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../src/common/enums/user-role.enum';

const prisma = new PrismaClient();

async function main() {
  const existingClinic = await prisma.clinic.findFirst();
  if (existingClinic) {
    console.log('Seed data already present, skipping.');
    return;
  }

  const clinic = await prisma.clinic.create({
    data: {
      name: 'Demo Dental Center',
      locale: 'en',
      timezone: 'Asia/Riyadh',
      users: {
        create: {
          email: 'owner@demo-clinic.com',
          fullName: 'Demo Owner',
          passwordHash: await bcrypt.hash('ChangeMe123!', 10),
          role: UserRole.OWNER,
        },
      },
    },
  });

  console.log(`Created clinic ${clinic.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
