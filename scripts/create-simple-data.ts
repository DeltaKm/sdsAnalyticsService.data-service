import { PrismaClient } from '../app/generated/prisma/client';

const prisma = new PrismaClient();

async function createSimpleData() {
  const uniqueKey = 'instance1-50-75-77';
  
  // Create stores
  const store1 = await prisma.store.upsert({
    where: { code: 'STORE001' },
    update: {},
    create: {
      code: 'STORE001',
      uniqueKey,
      name: 'Negozio Test 1',
      address: 'Via Test 1',
      city: 'Test City',
      region: 'Test Region',
      timezone: 'Europe/Rome',
    },
  });

  const store2 = await prisma.store.upsert({
    where: { code: 'STORE002' },
    update: {},
    create: {
      code: 'STORE002',
      uniqueKey,
      name: 'Negozio Test 2',
      address: 'Via Test 2',
      city: 'Test City',
      region: 'Test Region',
      timezone: 'Europe/Rome',
    },
  });

  console.log('Created stores:', store1.id, store2.id);

  // Create some overview daily metrics for November 2024
  const startDate = new Date('2024-11-01');
  const endDate = new Date('2024-11-30');
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const businessDate = new Date(date);
    
    // Store 1 metrics
    await prisma.overviewDailyMetrics.upsert({
      where: {
        storeId_businessDate: {
          storeId: store1.id,
          businessDate,
        },
      },
      update: {
        grossAmount: Math.floor(Math.random() * 1000) + 500,
        netAmount: Math.floor(Math.random() * 900) + 450,
        salesCount: Math.floor(Math.random() * 50) + 20,
        avgTicket: Math.floor(Math.random() * 50) + 20,
        coversCount: Math.floor(Math.random() * 100) + 50,
        avgCover: Math.floor(Math.random() * 30) + 15,
      },
      create: {
        businessDate,
        storeId: store1.id,
        grossAmount: Math.floor(Math.random() * 1000) + 500,
        netAmount: Math.floor(Math.random() * 900) + 450,
        salesCount: Math.floor(Math.random() * 50) + 20,
        avgTicket: Math.floor(Math.random() * 50) + 20,
        coversCount: Math.floor(Math.random() * 100) + 50,
        avgCover: Math.floor(Math.random() * 30) + 15,
      },
    });

    // Store 2 metrics
    await prisma.overviewDailyMetrics.upsert({
      where: {
        storeId_businessDate: {
          storeId: store2.id,
          businessDate,
        },
      },
      update: {
        grossAmount: Math.floor(Math.random() * 800) + 400,
        netAmount: Math.floor(Math.random() * 700) + 350,
        salesCount: Math.floor(Math.random() * 40) + 15,
        avgTicket: Math.floor(Math.random() * 40) + 18,
        coversCount: Math.floor(Math.random() * 80) + 40,
        avgCover: Math.floor(Math.random() * 25) + 12,
      },
      create: {
        businessDate,
        storeId: store2.id,
        grossAmount: Math.floor(Math.random() * 800) + 400,
        netAmount: Math.floor(Math.random() * 700) + 350,
        salesCount: Math.floor(Math.random() * 40) + 15,
        avgTicket: Math.floor(Math.random() * 40) + 18,
        coversCount: Math.floor(Math.random() * 80) + 40,
        avgCover: Math.floor(Math.random() * 25) + 12,
      },
    });
  }

  console.log('Test data created successfully!');
}

createSimpleData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
