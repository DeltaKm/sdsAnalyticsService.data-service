import { eachDayOfInterval, startOfDay, subDays } from "date-fns";
import {
  PrismaClient,
  Prisma,
  type Channel,
  type MenuItem,
  type Operator,
  type Store,
} from "@/app/generated/prisma/client";
import { OverviewRange } from "@/app/generated/prisma/enums";

const prisma = new PrismaClient({ log: ["warn", "error"] });

const storeSeeds = [
  {
    code: "ROMA_CENTRO",
    name: "Roma Centro",
    timezone: "Europe/Rome",
    address: "Via del Corso 15",
    city: "Roma",
    region: "Lazio",
  },
  {
    code: "MILANO_NAVIGLI",
    name: "Milano Navigli",
    timezone: "Europe/Rome",
    address: "Ripa di Porta Ticinese 22",
    city: "Milano",
    region: "Lombardia",
  },
  {
    code: "TORINO_CENTRO",
    name: "Torino Centro",
    timezone: "Europe/Rome",
    address: "Via Roma 120",
    city: "Torino",
    region: "Piemonte",
  },
];

const channelSeeds = [
  { code: "DINE_IN", name: "Sala" },
  { code: "TAKE_AWAY", name: "Take Away" },
  { code: "DELIVERY", name: "Delivery" },
];

const menuItemSeeds = [
  { sku: "PZ_MARGHERITA", name: "Pizza Margherita", category: "Pizza", price: 8.5, cost: 2.1 },
  { sku: "PZ_DIAVOLA", name: "Pizza Diavola", category: "Pizza", price: 9.5, cost: 2.4 },
  { sku: "BR_CLUB", name: "Club Sandwich", category: "Panini", price: 10.2, cost: 3.0 },
  { sku: "BR_BURGER", name: "Burger Classico", category: "Burger", price: 11.9, cost: 3.2 },
  { sku: "PT_FRITTE", name: "Patatine Fritte", category: "Sides", price: 4.0, cost: 1.1 },
  { sku: "DS_TIRAMISU", name: "Tiramisù", category: "Dessert", price: 5.0, cost: 1.6 },
  { sku: "DR_COLA", name: "Cola", category: "Bevande", price: 2.5, cost: 0.8 },
  { sku: "DR_BIRRA", name: "Birra Artigianale", category: "Bevande", price: 5.5, cost: 1.9 },
];

const operatorsByStoreCode: Record<string, string[]> = {
  ROMA_CENTRO: ["Giulia Rossi", "Luca Bianchi", "Sara Conti"],
  MILANO_NAVIGLI: ["Marco Neri", "Elena Ferrari", "Francesco Greco"],
  TORINO_CENTRO: ["Chiara Russo", "Davide Bruno", "Alessia Ricci"],
};

type TimeSlotAccumulator = { hour: string; sales: number; covers: number };

type OverviewAccumulator = {
  storeId: string;
  businessDate: Date;
  gross: number;
  net: number;
  sales: number;
  covers: number;
  timeSlots: Map<string, TimeSlotAccumulator>;
};

type StoreDailyAccumulator = {
  storeId: string;
  businessDate: Date;
  salesCount: number;
  grossAmount: number;
  documentBreakdown: Map<string, { documentType: string; salesCount: number; grossAmount: number }>;
};

type ChannelDailyAccumulator = {
  channelId: string;
  businessDate: Date;
  salesCount: number;
  grossAmount: number;
};

type OperatorDailyAccumulator = {
  operatorId: string;
  storeId: string;
  businessDate: Date;
  salesCount: number;
  grossAmount: number;
};

type CatalogItemDailyAccumulator = {
  itemId: string;
  storeId: string;
  businessDate: Date;
  quantity: number;
  grossAmount: number;
};

type SaleItemDetail = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

const documentTypes = ["Scontrino", "Fattura", "Ricevuta"];
const paymentMethods = ["contanti", "carta", "online", "voucher"];

const overviewMap = new Map<string, OverviewAccumulator>();
const salesStoreMap = new Map<string, StoreDailyAccumulator>();
const channelDailyMap = new Map<string, ChannelDailyAccumulator>();
const operatorDailyMap = new Map<string, OperatorDailyAccumulator>();
const catalogDailyMap = new Map<string, CatalogItemDailyAccumulator>();

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sample<T>(list: T[]): T {
  if (!list.length) {
    throw new Error("Cannot sample from empty list");
  }
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

function sampleMany<T>(list: T[], min: number, max: number): T[] {
  const count = Math.min(list.length, randomInt(min, max));
  const pool = [...list];
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = randomInt(0, pool.length - 1);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

function randomTimeSlot(): string {
  const hour = randomInt(6, 23);
  return hour.toString().padStart(2, "0");
}

function buildSaleItems(menuItems: MenuItem[]): { items: SaleItemDetail[]; gross: number; totalQuantity: number } {
  const picks = sampleMany(menuItems, 1, 4);
  const items: SaleItemDetail[] = [];
  let gross = 0;
  let totalQuantity = 0;

  for (const item of picks) {
    const quantity = randomInt(1, 3);
    const variance = randomFloat(0.9, 1.15);
    const unitPrice = round2(item.price * variance);
    const totalPrice = round2(unitPrice * quantity);
    items.push({
      id: item.id,
      name: item.name,
      category: item.category ?? null,
      quantity,
      unitPrice,
      totalPrice,
    });
    gross += totalPrice;
    totalQuantity += quantity;
  }

  return { items, gross: round2(gross), totalQuantity };
}

function recordAggregates(args: {
  storeId: string;
  channelId: string;
  operatorId?: string | null;
  businessDate: Date;
  timeSlot: string;
  documentType: string;
  grossAmount: number;
  netAmount: number;
  covers: number;
  items: SaleItemDetail[];
}) {
  const { storeId, channelId, operatorId, businessDate, timeSlot, documentType, grossAmount, netAmount, covers, items } = args;
  const dateKey = businessDate.toISOString();


  const overviewKey = `${storeId}|${dateKey}`;
  const overview = overviewMap.get(overviewKey) ?? {
    storeId,
    businessDate,
    gross: 0,
    net: 0,
    sales: 0,
    covers: 0,
    timeSlots: new Map<string, TimeSlotAccumulator>(),
  };
  overview.gross += grossAmount;
  overview.net += netAmount;
  overview.sales += 1;
  overview.covers += covers;
  const slot = overview.timeSlots.get(timeSlot) ?? { hour: timeSlot, sales: 0, covers: 0 };
  slot.sales += 1;
  slot.covers += covers;
  overview.timeSlots.set(timeSlot, slot);
  overviewMap.set(overviewKey, overview);

  
  const storeDaily = salesStoreMap.get(overviewKey) ?? {
    storeId,
    businessDate,
    salesCount: 0,
    grossAmount: 0,
    documentBreakdown: new Map<string, { documentType: string; salesCount: number; grossAmount: number }>(),
  };
  storeDaily.salesCount += 1;
  storeDaily.grossAmount += grossAmount;
  const doc = storeDaily.documentBreakdown.get(documentType) ?? { documentType, salesCount: 0, grossAmount: 0 };
  doc.salesCount += 1;
  doc.grossAmount += grossAmount;
  storeDaily.documentBreakdown.set(documentType, doc);
  salesStoreMap.set(overviewKey, storeDaily);

  
  const channelKey = `${channelId}|${dateKey}`;
  const channelDaily = channelDailyMap.get(channelKey) ?? {
    channelId,
    businessDate,
    salesCount: 0,
    grossAmount: 0,
  };
  channelDaily.salesCount += 1;
  channelDaily.grossAmount += grossAmount;
  channelDailyMap.set(channelKey, channelDaily);


  if (operatorId) {
    const operatorKey = `${operatorId}|${dateKey}`;
    const operatorDaily = operatorDailyMap.get(operatorKey) ?? {
      operatorId,
      storeId,
      businessDate,
      salesCount: 0,
      grossAmount: 0,
    };
    operatorDaily.salesCount += 1;
    operatorDaily.grossAmount += grossAmount;
    operatorDailyMap.set(operatorKey, operatorDaily);
  }


  for (const item of items) {
    const catalogKey = `${item.id}|${storeId}|${dateKey}`;
    const catalogDaily = catalogDailyMap.get(catalogKey) ?? {
      itemId: item.id,
      storeId,
      businessDate,
      quantity: 0,
      grossAmount: 0,
    };
    catalogDaily.quantity += item.quantity;
    catalogDaily.grossAmount += item.totalPrice;
    catalogDailyMap.set(catalogKey, catalogDaily);
  }
}

async function clearDatabase() {
  console.log("🧹 Clearing existing data...");
  await prisma.catalogItemDaily.deleteMany();
  await prisma.salesOperatorDaily.deleteMany();
  await prisma.salesChannelDaily.deleteMany();
  await prisma.salesStoreDaily.deleteMany();
  await prisma.overviewRollup.deleteMany();
  await prisma.overviewDailyMetrics.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.store.deleteMany();
}

async function seedCoreEntities() {
  console.log("Seeding base entities (stores, channels, menu items, operators)...");

  const stores = await Promise.all(
    storeSeeds.map((store) =>
      prisma.store.create({
        data: store,
      })
    )
  );

  const channels = await Promise.all(
    channelSeeds.map((channel) =>
      prisma.channel.create({
        data: channel,
      })
    )
  );

  const menuItems = await Promise.all(
    menuItemSeeds.map((item) =>
      prisma.menuItem.create({
        data: item,
      })
    )
  );

  const operatorsByStoreId = new Map<string, Operator[]>();

  for (const store of stores) {
    const names = operatorsByStoreCode[store.code] ?? [];
    const operators = await Promise.all(
      names.map((fullName, index) =>
        prisma.operator.create({
          data: {
            code: `${store.code}_OP_${String(index + 1).padStart(2, "0")}`,
            fullName,
            storeId: store.id,
          },
        })
      )
    );
    operatorsByStoreId.set(store.id, operators);
  }

  return { stores, channels, menuItems, operatorsByStoreId };
}

async function generateSalesYear(options: {
  stores: Store[];
  channels: Channel[];
  menuItems: MenuItem[];
  operatorsByStoreId: Map<string, Operator[]>;
}) {
  console.log("📈 Generating one year of synthetic sales...");

  overviewMap.clear();
  salesStoreMap.clear();
  channelDailyMap.clear();
  operatorDailyMap.clear();
  catalogDailyMap.clear();

  const { stores, channels, menuItems, operatorsByStoreId } = options;
  const referenceDate = startOfDay(new Date());
  const startDate = subDays(referenceDate, 364);
  const businessDates = eachDayOfInterval({ start: startDate, end: referenceDate });

  const saleDocuments: Prisma.SaleCreateManyInput[] = [];

  for (const businessDate of businessDates) {
    for (const store of stores) {
      const saleCount = randomInt(35, 75);
      const storeOperators = operatorsByStoreId.get(store.id) ?? [];

      for (let i = 0; i < saleCount; i++) {
        const channel = sample(channels);
        const operator = storeOperators.length && Math.random() > 0.15 ? sample(storeOperators) : undefined;
        const timeSlot = randomTimeSlot();
        const { items, gross, totalQuantity } = buildSaleItems(menuItems);
        const netFactor = randomFloat(0.82, 0.94);
        const net = round2(gross * netFactor);
        const covers = Math.max(1, randomInt(1, Math.max(2, Math.ceil(totalQuantity * randomFloat(0.6, 1.4)))));
        const documentType = sample(documentTypes);
        const methods = sampleMany(paymentMethods, 1, 2);

        saleDocuments.push({
          storeId: store.id,
          channelId: channel.id,
          operatorId: operator?.id,
          businessDate,
          timeSlot,
          grossAmount: gross,
          netAmount: net,
          customersCount: covers,
          documentType,
          paymentMethods: methods,
          items: items.map((item) => ({
            itemId: item.id,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        });

        recordAggregates({
          storeId: store.id,
          channelId: channel.id,
          operatorId: operator?.id,
          businessDate,
          timeSlot,
          documentType,
          grossAmount: gross,
          netAmount: net,
          covers,
          items,
        });
      }
    }
  }

  console.log(`Generated ${saleDocuments.length.toLocaleString()} sales documents.`);

  await chunkedCreateMany(prisma.sale, saleDocuments);

  console.log("Writing aggregate collections...");

  const overviewDailyData: Prisma.OverviewDailyMetricsCreateManyInput[] = [];
  const salesStoreData: Prisma.SalesStoreDailyCreateManyInput[] = [];
  const salesChannelData: Prisma.SalesChannelDailyCreateManyInput[] = [];
  const salesOperatorData: Prisma.SalesOperatorDailyCreateManyInput[] = [];
  const catalogDailyData: Prisma.CatalogItemDailyCreateManyInput[] = [];

  const overviewByStore = new Map<string, Prisma.OverviewDailyMetricsCreateManyInput[]>();

  for (const entry of overviewMap.values()) {
    const timeSlotBreakdown = Array.from(entry.timeSlots.values()).sort((a, b) => a.hour.localeCompare(b.hour));
    const record: Prisma.OverviewDailyMetricsCreateManyInput = {
      storeId: entry.storeId,
      businessDate: entry.businessDate,
      grossAmount: round2(entry.gross),
      netAmount: round2(entry.net),
      salesCount: entry.sales,
      avgTicket: entry.sales ? round2(entry.gross / entry.sales) : 0,
      coversCount: entry.covers,
      avgCover: entry.covers ? round2(entry.gross / entry.covers) : 0,
      timeSlotBreakdown,
    };
    overviewDailyData.push(record);
    const bucket = overviewByStore.get(entry.storeId) ?? [];
    bucket.push(record);
    overviewByStore.set(entry.storeId, bucket);
  }

  for (const entry of salesStoreMap.values()) {
    const breakdown = Array.from(entry.documentBreakdown.values()).sort((a, b) => b.grossAmount - a.grossAmount);
    salesStoreData.push({
      storeId: entry.storeId,
      businessDate: entry.businessDate,
      salesCount: entry.salesCount,
      grossAmount: round2(entry.grossAmount),
      avgTicket: entry.salesCount ? round2(entry.grossAmount / entry.salesCount) : 0,
      documentBreakdown: breakdown,
    });
  }

  for (const entry of channelDailyMap.values()) {
    salesChannelData.push({
      channelId: entry.channelId,
      businessDate: entry.businessDate,
      salesCount: entry.salesCount,
      grossAmount: round2(entry.grossAmount),
      avgTicket: entry.salesCount ? round2(entry.grossAmount / entry.salesCount) : 0,
    });
  }

  for (const entry of operatorDailyMap.values()) {
    salesOperatorData.push({
      operatorId: entry.operatorId,
      storeId: entry.storeId,
      businessDate: entry.businessDate,
      salesCount: entry.salesCount,
      grossAmount: round2(entry.grossAmount),
      avgTicket: entry.salesCount ? round2(entry.grossAmount / entry.salesCount) : 0,
    });
  }

  for (const entry of catalogDailyMap.values()) {
    catalogDailyData.push({
      itemId: entry.itemId,
      storeId: entry.storeId,
      businessDate: entry.businessDate,
      quantity: entry.quantity,
      grossAmount: round2(entry.grossAmount),
      avgPrice: entry.quantity ? round2(entry.grossAmount / entry.quantity) : 0,
    });
  }

  await chunkedCreateMany(prisma.overviewDailyMetrics, overviewDailyData);
  await chunkedCreateMany(prisma.salesStoreDaily, salesStoreData);
  await chunkedCreateMany(prisma.salesChannelDaily, salesChannelData);
  await chunkedCreateMany(prisma.salesOperatorDaily, salesOperatorData);
  await chunkedCreateMany(prisma.catalogItemDaily, catalogDailyData);

  console.log("Generating overview rollups...");

  const overviewRollups: Prisma.OverviewRollupCreateManyInput[] = [];

  for (const [storeId, records] of overviewByStore.entries()) {
    const sorted = [...records].sort(
      (a, b) => new Date(a.businessDate).getTime() - new Date(b.businessDate).getTime()
    );
    const referenceDate = sorted[sorted.length - 1]?.businessDate;
    if (!referenceDate) continue;

    const ranges: { range: OverviewRange; days: number }[] = [
      { range: OverviewRange.LAST_7_DAYS, days: 7 },
      { range: OverviewRange.LAST_30_DAYS, days: 30 },
      { range: OverviewRange.LAST_90_DAYS, days: 90 },
    ];

    for (const { range, days } of ranges) {
      const start = subDays(referenceDate, days - 1);
      const slice = sorted.filter((record) => record.businessDate >= start);
      if (!slice.length) continue;

      const gross = slice.reduce((acc, record) => acc + record.grossAmount, 0);
      const net = slice.reduce((acc, record) => acc + record.netAmount, 0);
      const sales = slice.reduce((acc, record) => acc + record.salesCount, 0);
      const covers = slice.reduce((acc, record) => acc + record.coversCount, 0);

      overviewRollups.push({
        storeId,
        range,
        referenceDate,
        grossAmount: round2(gross),
        netAmount: round2(net),
        salesCount: sales,
        avgTicket: sales ? round2(gross / sales) : 0,
        coversCount: covers,
        avgCover: covers ? round2(gross / covers) : 0,
      });
    }

    const gross = sorted.reduce((acc, record) => acc + record.grossAmount, 0);
    const net = sorted.reduce((acc, record) => acc + record.netAmount, 0);
    const sales = sorted.reduce((acc, record) => acc + record.salesCount, 0);
    const covers = sorted.reduce((acc, record) => acc + record.coversCount, 0);

    overviewRollups.push({
      storeId,
      range: OverviewRange.LIFETIME,
      referenceDate,
      grossAmount: round2(gross),
      netAmount: round2(net),
      salesCount: sales,
      avgTicket: sales ? round2(gross / sales) : 0,
      coversCount: covers,
      avgCover: covers ? round2(gross / covers) : 0,
    });
  }

  await chunkedCreateMany(prisma.overviewRollup, overviewRollups);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function chunkedCreateMany<T>(
  delegate: { createMany: (args: { data: T[] }) => Promise<unknown> },
  data: T[],
  chunkSize = 500
) {
  for (const chunk of chunkArray(data, chunkSize)) {
    if (chunk.length) {
      await delegate.createMany({ data: chunk });
    }
  }
}

async function main() {
  console.time("seed");
  await clearDatabase();
  const core = await seedCoreEntities();
  await generateSalesYear(core);
  console.timeEnd("seed");
  console.log("Seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
