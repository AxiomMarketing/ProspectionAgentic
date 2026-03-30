import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.scoringCoefficient.upsert({
    where: { name_version: { name: 'default', version: '1.0' } },
    update: {},
    create: {
      name: 'default',
      version: '1.0',
      isActive: true,
      coefficients: {
        icp: {
          label: 'Axe ICP',
          description: 'Ideal Customer Profile match',
          weight: 35,
        },
        signaux: {
          label: 'Axe Signaux',
          description: 'Business signals',
          weight: 30,
        },
        tech: {
          label: 'Axe Tech',
          description: 'Technology readiness',
          weight: 20,
        },
        engagement: {
          label: 'Axe Engagement',
          description: 'Engagement level',
          weight: 15,
        },
      },
    },
  });
  console.log('Seed complete: default ScoringCoefficient upserted');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
