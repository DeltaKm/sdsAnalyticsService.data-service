import { PrismaClient } from '../app/generated/prisma/client';

const prisma = new PrismaClient();

async function createTestData() {
  const uniqueKey = 'instance1-50-75-77';
  
  // Create store
  const store = await prisma.store.upsert({
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

  // Create second store
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

  console.log('Created stores:', store, store2);

  // Create some daily metrics for November 2024
  const startDate = new Date('2024-11-01');
  const endDate = new Date('2024-11-30');
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const businessDate = new Date(date);
    
    // Create overview daily metrics
    await prisma.overviewDailyMetrics.upsert({
      where: {
        storeId_businessDate: {
          storeId: store.id,
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
        timeSlotBreakdown: [{
          hour: "12:00",
          sales: Math.floor(Math.random() * 10) + 5,
          covers: Math.floor(Math.random() * 20) + 10,
        }],
      },
      create: {
        businessDate,
        storeId: store.id,
        grossAmount: Math.floor(Math.random() * 1000) + 500,
        netAmount: Math.floor(Math.random() * 900) + 450,
        salesCount: Math.floor(Math.random() * 50) + 20,
        avgTicket: Math.floor(Math.random() * 50) + 20,
        coversCount: Math.floor(Math.random() * 100) + 50,
        avgCover: Math.floor(Math.random() * 30) + 15,
        timeSlotBreakdown: [{
          hour: "12:00",
          sales: Math.floor(Math.random() * 10) + 5,
          covers: Math.floor(Math.random() * 20) + 10,
        }],
      },
    });

    // Create overview daily metrics for store 2
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
        timeSlotBreakdown: [{
          hour: "12:00",
          sales: Math.floor(Math.random() * 10) + 5,
          covers: Math.floor(Math.random() * 20) + 10,
        }],
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
        timeSlotBreakdown: [{
          hour: "12:00",
          sales: Math.floor(Math.random() * 10) + 5,
          covers: Math.floor(Math.random() * 20) + 10,
        }],
      },
    });

    // Create sales store daily data
    await prisma.salesStoreDaily.upsert({
      where: {
        storeId_businessDate: {
          storeId: store.id,
          businessDate,
        },
      },
      update: {
        grossAmount: Math.floor(Math.random() * 800) + 400,
        salesCount: Math.floor(Math.random() * 40) + 15,
        avgTicket: Math.floor(Math.random() * 40) + 18,
        documentBreakdown: [{
          documentType: "Scontrino",
          grossAmount: Math.floor(Math.random() * 800) + 400,
          salesCount: Math.floor(Math.random() * 40) + 15,
        }],
      },
      create: {
        businessDate,
        storeId: store.id,
        grossAmount: Math.floor(Math.random() * 800) + 400,
        salesCount: Math.floor(Math.random() * 40) + 15,
        avgTicket: Math.floor(Math.random() * 40) + 18,
        documentBreakdown: [{
          documentType: "Scontrino",
          grossAmount: Math.floor(Math.random() * 800) + 400,
          salesCount: Math.floor(Math.random() * 40) + 15,
        }],
      },
    });

    // Create sales store daily data for store 2
    await prisma.salesStoreDaily.upsert({
      where: {
        storeId_businessDate: {
          storeId: store2.id,
          businessDate,
        },
      },
      update: {
        grossAmount: Math.floor(Math.random() * 600) + 300,
        salesCount: Math.floor(Math.random() * 30) + 10,
        avgTicket: Math.floor(Math.random() * 35) + 15,
        documentBreakdown: [{
          documentType: "Fattura",
          grossAmount: Math.floor(Math.random() * 600) + 300,
          salesCount: Math.floor(Math.random() * 30) + 10,
        }],
      },
      create: {
        businessDate,
        storeId: store2.id,
        grossAmount: Math.floor(Math.random() * 600) + 300,
        salesCount: Math.floor(Math.random() * 30) + 10,
        avgTicket: Math.floor(Math.random() * 35) + 15,
        documentBreakdown: [{
          documentType: "Fattura",
          grossAmount: Math.floor(Math.random() * 600) + 300,
          salesCount: Math.floor(Math.random() * 30) + 10,
        }],
      },
    });
  }

  console.log('Test data created successfully!');
}

createTestData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
