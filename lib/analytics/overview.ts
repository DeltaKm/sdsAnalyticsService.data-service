import { prisma } from "@/lib/prisma";
import type { AnalyticsQuery, AnalyticsResponse } from "./schemas";
import { normalizeStores, resolveDateRange } from "./utils";

export async function getOverviewAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const { start, end } = resolveDateRange(query);
  const storeIds = normalizeStores(query.stores);
  const { uniqueKey } = query;

  // Filter by uniqueKey if provided (supports hierarchical prefix matching)
  let filteredStoreIds = storeIds;
  if (uniqueKey) {
    // Support hierarchical filtering:
    // - "instance1-50-75-77" → exact match (single store)
    // - "instance1-50-75" → all stores in company 75
    // - "instance1-50" → all stores in group 50
    const stores = await prisma.store.findMany({
      where: {
        uniqueKey: {
          startsWith: uniqueKey,
        },
      },
      select: { id: true },
    });
    const uniqueKeyStoreIds = stores.map(s => s.id);
    
    // Intersect with explicit storeIds if provided
    if (storeIds && storeIds.length > 0) {
      filteredStoreIds = storeIds.filter(id => uniqueKeyStoreIds.includes(id));
    } else {
      filteredStoreIds = uniqueKeyStoreIds;
    }
  }

  const [dailyMetrics, storeDaily] = await Promise.all([
    prisma.overviewDailyMetrics.findMany({
      where: {
        businessDate: { gte: start, lte: end },
        storeId: filteredStoreIds ? { in: filteredStoreIds } : undefined,
      },
      include: { store: true },
    }),
    prisma.salesStoreDaily.findMany({
      where: {
        businessDate: { gte: start, lte: end },
        storeId: filteredStoreIds ? { in: filteredStoreIds } : undefined,
      },
      include: { store: true },
    }),
  ]);

  const totals = dailyMetrics.reduce(
    (acc, metric) => {
      acc.gross += metric.grossAmount ?? 0;
      acc.net += metric.netAmount ?? 0;
      acc.sales += metric.salesCount ?? 0;
      acc.covers += metric.coversCount ?? 0;
      return acc;
    },
    { gross: 0, net: 0, sales: 0, covers: 0 }
  );

  const hoursMap = new Map<string, { sales: number; covers: number }>();
  for (const metric of dailyMetrics) {
    for (const slot of metric.timeSlotBreakdown ?? []) {
      const bucket = hoursMap.get(slot.hour) ?? { sales: 0, covers: 0 };
      bucket.sales += slot.sales ?? 0;
      bucket.covers += slot.covers ?? 0;
      hoursMap.set(slot.hour, bucket);
    }
  }

  const sortedHours = Array.from(hoursMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  const chartSeries = sortedHours.length
    ? [
        {
          name: "Vendite",
          data: sortedHours.map(([hour, value]) => ({ x: hour, y: value.sales })),
        },
        {
          name: "Coperti",
          data: sortedHours.map(([hour, value]) => ({ x: hour, y: value.covers })),
        },
      ]
    : [];

  const tableRows: AnalyticsResponse["table"]["rows"] = [];
  const tableColumns: AnalyticsResponse["table"]["columns"] = [
    { key: "store", label: "Punto Vendita", align: "left" },
    { key: "azienda", label: "Azienda", align: "left" },
    { key: "gruppo", label: "Gruppo", align: "left" },
    { key: "tipo_documento", label: "Tipo Documento", align: "left" },
    { key: "numero_vendite", label: "N. Vendite", align: "right" },
    { key: "venduto", label: "Venduto", align: "right" },
  ];

  for (const entry of storeDaily) {
    const storeName = entry.store?.name ?? entry.storeId;
    const companyName = entry.store?.companyName ?? "-";
    const corporateName = entry.store?.corporateName ?? "-";
    
    for (const doc of entry.documentBreakdown ?? []) {
      tableRows.push({
        store: storeName,
        azienda: companyName,
        gruppo: corporateName,
        tipo_documento: doc.documentType,
        numero_vendite: doc.salesCount ?? 0,
        venduto: doc.grossAmount ?? 0,
      });
    }
  }

  const kpi = {
    venduto: Number(totals.gross.toFixed(2)),
    numero_vendite: totals.sales,
    media_vendita: totals.sales ? Number((totals.gross / totals.sales).toFixed(2)) : 0,
    venduto_coperto: Number(totals.net.toFixed(2)),
    numero_coperti: totals.covers,
    media_coperto: totals.covers ? Number((totals.gross / totals.covers).toFixed(2)) : 0,
  } satisfies AnalyticsResponse["kpi"];

  return {
    kpi,
    chart: {
      series: chartSeries,
      xLabel: "Ora",
      yLabel: "Valore",
    },
    table: {
      columns: tableColumns,
      rows: tableRows,
    },
  };
}
