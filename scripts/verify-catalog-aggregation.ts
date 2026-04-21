import { PrismaClient } from "../app/generated/prisma/client";

type StoreDayAggregate = {
  storeCode: string;
  day: string;
  quantity: number;
  grossAmount: number;
};

type CliOptions = {
  from?: Date;
  to?: Date;
  limit: number;
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { limit: 20 };

  for (const arg of args) {
    if (arg.startsWith("--from=")) {
      const value = arg.slice("--from=".length).trim();
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) options.from = date;
      continue;
    }

    if (arg.startsWith("--to=")) {
      const value = arg.slice("--to=".length).trim();
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) options.to = date;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
      }
    }
  }

  return options;
}

function numberExpr(path: string) {
  return { $convert: { input: path, to: "double", onError: 0, onNull: 0 } };
}

function filterRowsByDateWindow(rows: StoreDayAggregate[], options: CliOptions): StoreDayAggregate[] {
  const fromDay = options.from ? options.from.toISOString().slice(0, 10) : undefined;
  const toDay = options.to ? options.to.toISOString().slice(0, 10) : undefined;

  if (!fromDay && !toDay) return rows;

  return rows.filter((row) => {
    if (fromDay && row.day < fromDay) return false;
    if (toDay && row.day > toDay) return false;
    return true;
  });
}

function normalizeCommandBatch(batch: unknown[]): StoreDayAggregate[] {
  const rows: StoreDayAggregate[] = [];

  for (const row of batch) {
    const item = row as {
      _id?: { storeCode?: string; day?: string };
      quantity?: number;
      grossAmount?: number;
    };

    rows.push({
      storeCode: item?._id?.storeCode ?? "UNKNOWN",
      day: item?._id?.day ?? "UNKNOWN",
      quantity: Number(item?.quantity ?? 0),
      grossAmount: Number(item?.grossAmount ?? 0),
    });
  }

  return rows;
}

async function loadIngressAggregates(prisma: PrismaClient, options: CliOptions): Promise<StoreDayAggregate[]> {
  const pipeline: Record<string, unknown>[] = [
    {
      $project: {
        eventDate: { $toDate: { $ifNull: ["$payload.jobDateTime", "$createdAt"] } },
        storeCode: { $toString: { $ifNull: ["$payload.store.id", "UNKNOWN"] } },
        rows: { $ifNull: ["$payload.rows", []] },
      },
    },
  ];

  pipeline.push(
    { $unwind: { path: "$rows", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        storeCode: 1,
        day: { $dateToString: { format: "%Y-%m-%d", date: "$eventDate" } },
        quantity: numberExpr("$rows.quantity"),
        grossAmount: {
          $let: {
            vars: {
              totalPrice: numberExpr("$rows.totalPrice"),
              price: numberExpr("$rows.price"),
              quantity: numberExpr("$rows.quantity"),
            },
            in: {
              $cond: [
                { $gt: ["$$totalPrice", 0] },
                "$$totalPrice",
                { $multiply: ["$$price", "$$quantity"] },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: { storeCode: "$storeCode", day: "$day" },
        quantity: { $sum: "$quantity" },
        grossAmount: { $sum: "$grossAmount" },
      },
    }
  );

  const result = (await prisma.$runCommandRaw({
    aggregate: "ingress_events",
    pipeline,
    cursor: {},
  } as any)) as { cursor?: { firstBatch?: unknown[] } };

  return filterRowsByDateWindow(normalizeCommandBatch(result?.cursor?.firstBatch ?? []), options);
}

async function loadCatalogAggregates(prisma: PrismaClient, options: CliOptions): Promise<StoreDayAggregate[]> {
  const pipeline: Record<string, unknown>[] = [];

  pipeline.push(
    {
      $lookup: {
        from: "stores",
        localField: "storeId",
        foreignField: "_id",
        as: "store",
      },
    },
    { $unwind: { path: "$store", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        storeCode: { $toString: { $ifNull: ["$store.code", "UNKNOWN"] } },
        day: { $dateToString: { format: "%Y-%m-%d", date: "$business_date" } },
        quantity: numberExpr("$quantity"),
        grossAmount: numberExpr("$grossAmount"),
      },
    },
    {
      $group: {
        _id: { storeCode: "$storeCode", day: "$day" },
        quantity: { $sum: "$quantity" },
        grossAmount: { $sum: "$grossAmount" },
      },
    }
  );

  const result = (await prisma.$runCommandRaw({
    aggregate: "catalog_item_daily",
    pipeline,
    cursor: {},
  } as any)) as { cursor?: { firstBatch?: unknown[] } };

  return filterRowsByDateWindow(normalizeCommandBatch(result?.cursor?.firstBatch ?? []), options);
}

function toMap(rows: StoreDayAggregate[]): Map<string, StoreDayAggregate> {
  const map = new Map<string, StoreDayAggregate>();
  for (const row of rows) {
    map.set(`${row.storeCode}__${row.day}`, row);
  }
  return map;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function sanitizeIsoDate(date?: Date): string | null {
  if (!date) return null;
  return date.toISOString().trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const ingressRows = await loadIngressAggregates(prisma, options);
    const catalogRows = await loadCatalogAggregates(prisma, options);

    const ingressMap = toMap(ingressRows);
    const catalogMap = toMap(catalogRows);

    let ingressQty = 0;
    let ingressGross = 0;
    for (const row of ingressMap.values()) {
      ingressQty += row.quantity;
      ingressGross += row.grossAmount;
    }

    let catalogQty = 0;
    let catalogGross = 0;
    for (const row of catalogMap.values()) {
      catalogQty += row.quantity;
      catalogGross += row.grossAmount;
    }

    const mismatches: Array<{
      storeCode: string;
      day: string;
      ingressQuantity: number;
      catalogQuantity: number;
      qtyDelta: number;
      ingressGross: number;
      catalogGross: number;
      grossDelta: number;
    }> = [];

    const keys = new Set([...ingressMap.keys(), ...catalogMap.keys()]);
    for (const key of keys) {
      const ingress = ingressMap.get(key) ?? {
        storeCode: key.split("__")[0],
        day: key.split("__")[1],
        quantity: 0,
        grossAmount: 0,
      };

      const catalog = catalogMap.get(key) ?? {
        storeCode: key.split("__")[0],
        day: key.split("__")[1],
        quantity: 0,
        grossAmount: 0,
      };

      const qtyDelta = ingress.quantity - catalog.quantity;
      const grossDelta = ingress.grossAmount - catalog.grossAmount;

      if (Math.abs(qtyDelta) > 0.0001 || Math.abs(grossDelta) > 0.01) {
        mismatches.push({
          storeCode: ingress.storeCode,
          day: ingress.day,
          ingressQuantity: round2(ingress.quantity),
          catalogQuantity: round2(catalog.quantity),
          qtyDelta: round2(qtyDelta),
          ingressGross: round2(ingress.grossAmount),
          catalogGross: round2(catalog.grossAmount),
          grossDelta: round2(grossDelta),
        });
      }
    }

    const ingressOnly = mismatches.filter(
      (row) => (Math.abs(row.catalogQuantity) <= 0.0001 && Math.abs(row.catalogGross) <= 0.01)
    );

    const catalogOnly = mismatches.filter(
      (row) => (Math.abs(row.ingressQuantity) <= 0.0001 && Math.abs(row.ingressGross) <= 0.01)
    );

    const overlapDiff = mismatches.filter(
      (row) =>
        !(Math.abs(row.catalogQuantity) <= 0.0001 && Math.abs(row.catalogGross) <= 0.01) &&
        !(Math.abs(row.ingressQuantity) <= 0.0001 && Math.abs(row.ingressGross) <= 0.01)
    );

    const catalogUnknownStoreRows = catalogRows.filter((row) => row.storeCode === "UNKNOWN");
    const catalogUnknownStoreGross = catalogUnknownStoreRows.reduce((sum, row) => sum + row.grossAmount, 0);

    mismatches.sort((a, b) => Math.abs(b.grossDelta) - Math.abs(a.grossDelta));
    ingressOnly.sort((a, b) => Math.abs(b.grossDelta) - Math.abs(a.grossDelta));
    catalogOnly.sort((a, b) => Math.abs(b.grossDelta) - Math.abs(a.grossDelta));
    overlapDiff.sort((a, b) => Math.abs(b.grossDelta) - Math.abs(a.grossDelta));

    console.log(
      JSON.stringify(
        {
          scriptVersion: "1.1",
          options: {
            from: sanitizeIsoDate(options.from),
            to: sanitizeIsoDate(options.to),
            limit: options.limit,
          },
          totals: {
            ingress: {
              groups: ingressMap.size,
              quantity: round2(ingressQty),
              grossAmount: round2(ingressGross),
            },
            catalogItemDaily: {
              groups: catalogMap.size,
              quantity: round2(catalogQty),
              grossAmount: round2(catalogGross),
            },
            delta: {
              quantity: round2(ingressQty - catalogQty),
              grossAmount: round2(ingressGross - catalogGross),
            },
          },
          mismatchCount: mismatches.length,
          mismatchBreakdown: {
            ingressOnly: ingressOnly.length,
            catalogOnly: catalogOnly.length,
            overlapDiff: overlapDiff.length,
          },
          diagnostics: {
            catalogUnknownStore: {
              groups: catalogUnknownStoreRows.length,
              grossAmount: round2(catalogUnknownStoreGross),
            },
          },
          topMismatches: mismatches.slice(0, options.limit),
          topIngressOnly: ingressOnly.slice(0, options.limit),
          topCatalogOnly: catalogOnly.slice(0, options.limit),
          topOverlapDiff: overlapDiff.slice(0, options.limit),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
