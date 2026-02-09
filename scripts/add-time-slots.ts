import { PrismaClient } from '../app/generated/prisma/client';

const prisma = new PrismaClient();

async function addTimeSlots() {
  const uniqueKey = 'instance1-50-75-77';
  
  // Get our stores
  const stores = await prisma.store.findMany({
    where: { uniqueKey },
  });

  console.log('Updating time slots for stores:', stores.length);

  // Generate time slots for each day (8:00 - 23:00)
  const hours = [];
  for (let h = 8; h <= 23; h++) {
    hours.push(`${h.toString().padStart(2, '0')}:00`);
  }

  // Get all overview metrics for our stores
  const metrics = await prisma.overviewDailyMetrics.findMany({
    where: { store: { uniqueKey } },
  });

  console.log('Found metrics to update:', metrics.length);

  for (const metric of metrics) {
    // Generate random time slot data for the day
    const timeSlotBreakdown = hours.map(hour => {
      const baseSales = Math.floor(Math.random() * 10) + 1;
      const baseCovers = Math.floor(Math.random() * 20) + 5;
      
      // Peak hours have more activity
      const multiplier = (hour >= '12:00' && hour <= '14:00') || (hour >= '19:00' && hour <= '21:00') ? 2 : 1;
      
      return {
        hour,
        sales: baseSales * multiplier,
        covers: baseCovers * multiplier,
      };
    });

    // Update the metric with time slots
    await prisma.overviewDailyMetrics.update({
      where: { id: metric.id },
      data: { timeSlotBreakdown },
    });
  }

  console.log('Time slots added successfully!');
}

addTimeSlots()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
