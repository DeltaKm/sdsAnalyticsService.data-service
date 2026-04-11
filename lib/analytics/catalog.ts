import { prisma } from "@/lib/prisma";
import type { AnalyticsQuery, AnalyticsResponse } from "./schemas";
import { normalizeStores, resolveDateRange } from "./utils";

type CatalogDailyRow = {
  itemId: string;
  quantity: number;
  grossAmount: number;
  item: {
    name: string;
    category: string | null;
  } | null;
};

type CatalogRow = {
  itemId: string;
  itemName: string;
  category: string;
  quantity: number;
  venduto: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function classifyTipologia(category: string | null | undefined): "Food" | "Beverage" | "Altro" {
  const normalized = (category ?? "").toLowerCase();
  if (!normalized) return "Altro";

  const beverageTokens = ["bev", "drink", "bibit", "birra", "vino", "cocktail", "cola", "acqua", "caffe", "the"];
  if (beverageTokens.some((token) => normalized.includes(token))) {
    return "Beverage";
  }

  return "Food";
}

async function resolveScopedStoreIds(query: AnalyticsQuery): Promise<string[] | undefined> {
  const storeIds = normalizeStores(query.stores);

  if (!query.uniqueKey) {
    return storeIds;
  }

  const stores = await prisma.store.findMany({
    where: {
      uniqueKey: {
        startsWith: query.uniqueKey,
      },
    },
    select: { id: true },
  });

  const uniqueKeyStoreIds = stores.map((store: { id: string }) => store.id);

  if (storeIds && storeIds.length > 0) {
    return storeIds.filter((id) => uniqueKeyStoreIds.includes(id));
  }

  return uniqueKeyStoreIds;
}

async function loadCatalogRows(query: AnalyticsQuery): Promise<CatalogRow[]> {
  const { start, end } = resolveDateRange(query);
  const filteredStoreIds = await resolveScopedStoreIds(query);

  const daily = (await prisma.catalogItemDaily.findMany({
    where: {
      businessDate: { gte: start, lte: end },
      storeId: filteredStoreIds ? { in: filteredStoreIds } : undefined,
    },
    include: {
      item: true,
    },
  })) as CatalogDailyRow[];

  return daily.map((entry: CatalogDailyRow) => ({
    itemId: entry.itemId,
    itemName: entry.item?.name ?? entry.itemId,
    category: entry.item?.category ?? "Altro",
    quantity: entry.quantity ?? 0,
    venduto: entry.grossAmount ?? 0,
  }));
}

export async function getCatalogCategoriesTopAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const rows = await loadCatalogRows(query);

  const byCategory = new Map<string, { nome_categoria: string; quantita: number; venduto: number }>();

  for (const row of rows) {
    const key = row.category || "Altro";
    const bucket = byCategory.get(key) ?? { nome_categoria: key, quantita: 0, venduto: 0 };
    bucket.quantita += row.quantity;
    bucket.venduto += row.venduto;
    byCategory.set(key, bucket);
  }

  const tableRows: Array<{ nome_categoria: string; quantita: number; media: number; venduto: number }> = Array.from(
    byCategory.values()
  )
    .map((row) => ({
      nome_categoria: row.nome_categoria,
      quantita: row.quantita,
      media: row.quantita ? round2(row.venduto / row.quantita) : 0,
      venduto: round2(row.venduto),
    }))
    .sort((a, b) => Number(b.venduto) - Number(a.venduto));

  const top = tableRows.slice(0, 10);
  const totalVenduto = tableRows.reduce((sum: number, row) => sum + Number(row.venduto ?? 0), 0);
  const totalQuantita = tableRows.reduce((sum: number, row) => sum + Number(row.quantita ?? 0), 0);

  return {
    kpi: {
      venduto: round2(totalVenduto),
      quantita: totalQuantita,
      media: totalQuantita ? round2(totalVenduto / totalQuantita) : 0,
    },
    chart: {
      series: [
        {
          name: "Venduto",
          data: top.map((row) => ({ x: String(row.nome_categoria), y: Number(row.venduto ?? 0) })),
        },
      ],
      xLabel: "Categoria",
      yLabel: "Venduto",
    },
    table: {
      columns: [
        { key: "nome_categoria", label: "Nome categoria", align: "left" },
        { key: "quantita", label: "Quantità", align: "right" },
        { key: "media", label: "Media", align: "right" },
        { key: "venduto", label: "Venduto", align: "right" },
      ],
      rows: tableRows as AnalyticsResponse["table"]["rows"],
    },
  };
}

export async function getCatalogProductsTopAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const rows = await loadCatalogRows(query);

  const byProduct = new Map<string, { nome_prodotto: string; categoria: string; quantita: number; venduto: number }>();

  for (const row of rows) {
    const key = row.itemId;
    const bucket = byProduct.get(key) ?? {
      nome_prodotto: row.itemName,
      categoria: row.category,
      quantita: 0,
      venduto: 0,
    };
    bucket.quantita += row.quantity;
    bucket.venduto += row.venduto;
    byProduct.set(key, bucket);
  }

  const tableRows: Array<{
    nome_prodotto: string;
    categoria: string;
    quantita: number;
    media: number;
    venduto: number;
  }> = Array.from(byProduct.values())
    .map((row) => ({
      nome_prodotto: row.nome_prodotto,
      categoria: row.categoria,
      quantita: row.quantita,
      media: row.quantita ? round2(row.venduto / row.quantita) : 0,
      venduto: round2(row.venduto),
    }))
    .sort((a, b) => Number(b.venduto) - Number(a.venduto));

  const top = tableRows.slice(0, 10);
  const totalVenduto = tableRows.reduce((sum: number, row) => sum + Number(row.venduto ?? 0), 0);
  const totalQuantita = tableRows.reduce((sum: number, row) => sum + Number(row.quantita ?? 0), 0);

  return {
    kpi: {
      venduto: round2(totalVenduto),
      quantita: totalQuantita,
      media: totalQuantita ? round2(totalVenduto / totalQuantita) : 0,
    },
    chart: {
      series: [
        {
          name: "Venduto",
          data: top.map((row) => ({ x: String(row.nome_prodotto), y: Number(row.venduto ?? 0) })),
        },
      ],
      xLabel: "Prodotto",
      yLabel: "Venduto",
    },
    table: {
      columns: [
        { key: "nome_prodotto", label: "Prodotto", align: "left" },
        { key: "categoria", label: "Categoria", align: "left" },
        { key: "quantita", label: "Quantità", align: "right" },
        { key: "media", label: "Media", align: "right" },
        { key: "venduto", label: "Venduto", align: "right" },
      ],
      rows: tableRows as AnalyticsResponse["table"]["rows"],
    },
  };
}

export async function getCatalogByTypeAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
  const rows = await loadCatalogRows(query);

  const byType = new Map<string, { tipo: string; quantita: number; venduto: number }>();

  for (const row of rows) {
    const tipo = classifyTipologia(row.category);
    const bucket = byType.get(tipo) ?? { tipo, quantita: 0, venduto: 0 };
    bucket.quantita += row.quantity;
    bucket.venduto += row.venduto;
    byType.set(tipo, bucket);
  }

  const tableRows: Array<{ tipo: string; quantita: number; media: number; venduto: number }> = Array.from(
    byType.values()
  )
    .map((row) => ({
      tipo: row.tipo,
      quantita: row.quantita,
      media: row.quantita ? round2(row.venduto / row.quantita) : 0,
      venduto: round2(row.venduto),
    }))
    .sort((a, b) => Number(b.venduto) - Number(a.venduto));

  const totalVenduto = tableRows.reduce((sum: number, row) => sum + Number(row.venduto ?? 0), 0);
  const totalQuantita = tableRows.reduce((sum: number, row) => sum + Number(row.quantita ?? 0), 0);

  return {
    kpi: {
      venduto: round2(totalVenduto),
      quantita: totalQuantita,
      media: totalQuantita ? round2(totalVenduto / totalQuantita) : 0,
    },
    chart: {
      series: [
        {
          name: "Venduto",
          data: tableRows.map((row) => ({ x: String(row.tipo), y: Number(row.venduto ?? 0) })),
        },
      ],
      xLabel: "Tipologia",
      yLabel: "Venduto",
    },
    table: {
      columns: [
        { key: "tipo", label: "Tipo", align: "left" },
        { key: "quantita", label: "Quantità", align: "right" },
        { key: "media", label: "Media", align: "right" },
        { key: "venduto", label: "Venduto", align: "right" },
      ],
      rows: tableRows as AnalyticsResponse["table"]["rows"],
    },
  };
}
