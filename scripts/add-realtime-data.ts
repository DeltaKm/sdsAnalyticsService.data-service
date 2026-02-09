import { PrismaClient } from '../app/generated/prisma/client';

const prisma = new PrismaClient();

async function addRealtimeData() {
  const uniqueKey = 'instance1-50-75-77';
  const storeId = '698a211ff22ec5406e25097e'; // Negozio Test 1
  const businessDate = new Date('2024-11-15');
  const hour = '20:00';
  
  // Get the store
  const store = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    console.log('Store not found');
    return;
  }

  console.log('Updating data for store:', store.name);

  // Update overview daily metrics for today
  const existingMetric = await prisma.overviewDailyMetrics.findFirst({
    where: {
      storeId: store.id,
      businessDate,
    },
  });

  if (existingMetric) {
    // Add the new sale to existing metrics
    const newGrossAmount = existingMetric.grossAmount + 85.50;
    const newNetAmount = existingMetric.netAmount + 70.08;
    const newSalesCount = existingMetric.salesCount + 1;
    const newCoversCount = existingMetric.coversCount + 3; // 3 items
    
    // Update time slots - add to the 20:00 slot
    const updatedTimeSlots = existingMetric.timeSlotBreakdown.map(slot => {
      if (slot.hour === hour) {
        return {
          hour: slot.hour,
          sales: slot.sales + 1,
          covers: slot.covers + 3,
        };
      }
      return slot;
    });

    await prisma.overviewDailyMetrics.update({
      where: { id: existingMetric.id },
      data: {
        grossAmount: newGrossAmount,
        netAmount: newNetAmount,
        salesCount: newSalesCount,
        avgTicket: newGrossAmount / newSalesCount,
        coversCount: newCoversCount,
        avgCover: newGrossAmount / newCoversCount,
        timeSlotBreakdown: updatedTimeSlots,
      },
    });

    console.log('Updated overview metrics for today');
  }

  // Update sales store daily
  const existingSales = await prisma.salesStoreDaily.findFirst({
    where: {
      storeId: store.id,
      businessDate,
    },
  });

  if (existingSales) {
    const newGrossAmount = existingSales.grossAmount + 85.50;
    const newSalesCount = existingSales.salesCount + 1;
    
    // Add to document breakdown
    const updatedDocBreakdown = existingSales.documentBreakdown.map(doc => {
      if (doc.documentType === 'Scontrino RT') {
        return {
          documentType: doc.documentType,
          grossAmount: doc.grossAmount + 85.50,
          salesCount: doc.salesCount + 1,
        };
      }
      return doc;
    });

    await prisma.salesStoreDaily.update({
      where: { id: existingSales.id },
      data: {
        grossAmount: newGrossAmount,
        salesCount: newSalesCount,
        avgTicket: newGrossAmount / newSalesCount,
        documentBreakdown: updatedDocBreakdown,
      },
    });

    console.log('Updated sales data for today');
  }

  console.log('Realtime data added successfully!');
}

addRealtimeData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
