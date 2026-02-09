import { PrismaClient } from '../app/generated/prisma/client';

const prisma = new PrismaClient();

async function createSalesData() {
  const uniqueKey = 'instance1-50-75-77';
  
  // Get our stores
  const stores = await prisma.store.findMany({
    where: { uniqueKey },
  });

  console.log('Found stores:', stores.length);

  // Document types to create
  const documentTypes = ['Scontrino', 'Fattura', 'DDT', 'Nota di Credito'];
  
  // Create sales data for November 2024
  const startDate = new Date('2024-11-01');
  const endDate = new Date('2024-11-30');
  
  for (const store of stores) {
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const businessDate = new Date(date);
      
      // Create document breakdown for different document types
      const documentBreakdown = documentTypes.map(docType => {
        const grossAmount = Math.floor(Math.random() * 400) + 100;
        const salesCount = Math.floor(Math.random() * 15) + 2;
        
        return {
          documentType: docType,
          grossAmount,
          salesCount,
        };
      });
      
      // Calculate totals
      const totalGrossAmount = documentBreakdown.reduce((sum, doc) => sum + doc.grossAmount, 0);
      const totalSalesCount = documentBreakdown.reduce((sum, doc) => sum + doc.salesCount, 0);
      const avgTicket = totalSalesCount > 0 ? totalGrossAmount / totalSalesCount : 0;
      
      await prisma.salesStoreDaily.upsert({
        where: {
          storeId_businessDate: {
            storeId: store.id,
            businessDate,
          },
        },
        update: {
          grossAmount: totalGrossAmount,
          salesCount: totalSalesCount,
          avgTicket,
          documentBreakdown,
        },
        create: {
          businessDate,
          storeId: store.id,
          grossAmount: totalGrossAmount,
          salesCount: totalSalesCount,
          avgTicket,
          documentBreakdown,
        },
      });
    }
  }

  console.log('Sales data created successfully!');
}

createSalesData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
