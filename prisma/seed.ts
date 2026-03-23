import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Create default scoring coefficients
  await prisma.scoringCoefficient.upsert({
    where: { name_version: { name: 'default', version: '1.0' } },
    update: {},
    create: {
      name: 'default',
      version: '1.0',
      isActive: true,
      coefficients: {
        firmographic: 0.35,
        technographic: 0.20,
        behavioral: 0.15,
        engagement: 0.15,
        intent: 0.15,
      },
    },
  });
  console.log('Seed data created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
