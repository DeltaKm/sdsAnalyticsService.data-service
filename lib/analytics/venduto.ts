import { prisma } from "@/lib/prisma";
import type { AnalyticsQuery, AnalyticsResponse } from "./schemas";
import { normalizeStores, resolveDateRange } from "./utils";

type SalesDocKind = "receipt" | "invoice" | null;

function classifyDocumentType(documentType: string | null | undefined): SalesDocKind {
  if (!documentType) return null;

  const normalized = documentType.toLowerCase();

  if (normalized.includes("scontrino")) {
    return "receipt";
  }

  if (normalized.includes("fattura") && !normalized.includes("acquisto")) {
    return "invoice";
  }

  return null;
}

export async function getVendutoAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const { start, end } = resolveDateRange(query);
  const storeIds = normalizeStores(query.stores);
  const { uniqueKey } = query;

  let filteredStoreIds = storeIds;
  if (uniqueKey) {
    const stores = await prisma.store.findMany({
      where: {
        uniqueKey: {
          startsWith: uniqueKey,
        },
      },
      select: { id: true },
    });

    const uniqueKeyStoreIds = stores.map((store) => store.id);

    if (storeIds && storeIds.length > 0) {
      filteredStoreIds = storeIds.filter((id) => uniqueKeyStoreIds.includes(id));
    } else {
      filteredStoreIds = uniqueKeyStoreIds;
    }
  }

  const daily = await prisma.salesStoreDaily.findMany({
    where: {
      businessDate: { gte: start, lte: end },
      storeId: filteredStoreIds ? { in: filteredStoreIds } : undefined,
    },
    include: { store: true },
  });

  const dailyTrend = new Map<string, { venduto: number; documenti: number }>();
  const byStore = new Map<
    string,
    {
      store: string;
      azienda: string;
      gruppo: string;
      numero_documenti: number;
      venduto: number;
      numero_scontrini: number;
      venduto_scontrini: number;
      numero_fatture: number;
      venduto_fatture: number;
    }
  >();

  const totals = {
    venduto: 0,
    documenti: 0,
    vendutoScontrini: 0,
    vendutoFatture: 0,
    numeroScontrini: 0,
    numeroFatture: 0,
  };

  for (const entry of daily) {
    const storeName = entry.store?.name ?? entry.storeId;
    const companyName = entry.store?.companyName ?? "-";
    const corporateName = entry.store?.corporateName ?? "-";
    const storeBucket =
      byStore.get(entry.storeId) ??
      {
        store: storeName,
        azienda: companyName,
        gruppo: corporateName,
        numero_documenti: 0,
        venduto: 0,
        numero_scontrini: 0,
        venduto_scontrini: 0,
        numero_fatture: 0,
        venduto_fatture: 0,
      };

    const dayKey = entry.businessDate.toISOString().slice(0, 10);
    const trendBucket = dailyTrend.get(dayKey) ?? { venduto: 0, documenti: 0 };

    for (const doc of entry.documentBreakdown ?? []) {
      const kind = classifyDocumentType(doc.documentType);
      if (!kind) {
        continue;
      }

      const amount = doc.grossAmount ?? 0;
      const count = doc.salesCount ?? 0;

      totals.venduto += amount;
      totals.documenti += count;
      storeBucket.venduto += amount;
      storeBucket.numero_documenti += count;
      trendBucket.venduto += amount;
      trendBucket.documenti += count;

      if (kind === "receipt") {
        totals.vendutoScontrini += amount;
        totals.numeroScontrini += count;
        storeBucket.venduto_scontrini += amount;
        storeBucket.numero_scontrini += count;
      }

      if (kind === "invoice") {
        totals.vendutoFatture += amount;
        totals.numeroFatture += count;
        storeBucket.venduto_fatture += amount;
        storeBucket.numero_fatture += count;
      }
    }

    byStore.set(entry.storeId, storeBucket);
    dailyTrend.set(dayKey, trendBucket);
  }

  const sortedTrend = Array.from(dailyTrend.entries()).sort(([a], [b]) => a.localeCompare(b));

  const chartSeries: AnalyticsResponse["chart"]["series"] = sortedTrend.length
    ? [
        {
          name: "Venduto",
          data: sortedTrend.map(([day, value]) => ({ x: day, y: Number(value.venduto.toFixed(2)) })),
        },
        {
          name: "Documenti",
          data: sortedTrend.map(([day, value]) => ({ x: day, y: value.documenti })),
        },
      ]
    : [];

  const tableColumns: AnalyticsResponse["table"]["columns"] = [
    { key: "store", label: "Punto Vendita", align: "left" },
    { key: "azienda", label: "Attività", align: "left" },
    { key: "gruppo", label: "Gruppo", align: "left" },
    { key: "numero_documenti", label: "N. Documenti", align: "right" },
    { key: "venduto", label: "Venduto", align: "right" },
    { key: "ticket_medio", label: "Ticket Medio", align: "right" },
    { key: "numero_scontrini", label: "N. Scontrini", align: "right" },
    { key: "venduto_scontrini", label: "Venduto Scontrini", align: "right" },
    { key: "numero_fatture", label: "N. Fatture", align: "right" },
    { key: "venduto_fatture", label: "Venduto Fatture", align: "right" },
  ];

  const tableRows: AnalyticsResponse["table"]["rows"] = Array.from(byStore.values())
    .map((store) => ({
      ...store,
      venduto: Number(store.venduto.toFixed(2)),
      ticket_medio: store.numero_documenti ? Number((store.venduto / store.numero_documenti).toFixed(2)) : 0,
      venduto_scontrini: Number(store.venduto_scontrini.toFixed(2)),
      venduto_fatture: Number(store.venduto_fatture.toFixed(2)),
    }))
    .sort((a, b) => Number(b.venduto) - Number(a.venduto));

  const venduto = Number(totals.venduto.toFixed(2));
  const ticketMedio = totals.documenti ? Number((venduto / totals.documenti).toFixed(2)) : 0;
  const incidenzaScontrini = venduto ? Number(((totals.vendutoScontrini / venduto) * 100).toFixed(2)) : 0;
  const incidenzaFatture = venduto ? Number(((totals.vendutoFatture / venduto) * 100).toFixed(2)) : 0;

  const kpi = {
    venduto,
    numero_documenti: totals.documenti,
    ticket_medio: ticketMedio,
    venduto_scontrini: Number(totals.vendutoScontrini.toFixed(2)),
    venduto_fatture: Number(totals.vendutoFatture.toFixed(2)),
    incidenza_scontrini_pct: incidenzaScontrini,
    incidenza_fatture_pct: incidenzaFatture,
  } satisfies AnalyticsResponse["kpi"];

  return {
    kpi,
    chart: {
      series: chartSeries,
      xLabel: "Giorno",
      yLabel: "Valore",
    },
    table: {
      columns: tableColumns,
      rows: tableRows,
    },
  };
}
