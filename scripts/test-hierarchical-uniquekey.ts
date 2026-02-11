/**
 * Test script for hierarchical uniqueKey filtering
 * 
 * Creates test data for multiple stores across different hierarchy levels:
 * - Group 50 (Gruppo Enzo)
 *   - Company 75 (Azienda 1)
 *     - Store 77 (Bar)
 *     - Store 78 (Ristorante)
 *   - Company 76 (Azienda 2)
 *     - Store 79 (Pizzeria)
 */

const DATA_MAPPER_URL = "http://localhost:3002/api/v1/ingress/pos";
const DATA_SERVICE_URL = "http://localhost:3001";
const DATA_MAPPER_API_KEY = "OG6DelQq1NcE4C89jdNsSKpe2d0REGPBI4YjPbZhE6iO42E2etAcIJ9chtjNebvCgNdx0KOhhloI8EuYtWopMXz8dp9zIcjuPJP5KVyezgYJVqHXUaQvSbBCgHQhUUc659U2JySWeZKe2aj1BxgkBwKT7RiAHfXJa7bfCNVyVcYe6Pp5JnXO6cktFYX5Td2RbBuZmPwQcvpqYW2vgWiSyqqHrJ5dmygNC6xqNT0zPnKNKvAMqCaaczM2bQqc8DjD";

interface TestStore {
  uniqueKey: string;
  storeId: number;
  storeName: string;
  amount: number;
}

const testStores: TestStore[] = [
  {
    uniqueKey: "instance1-50-75-77",
    storeId: 77,
    storeName: "Bar Azienda 1",
    amount: 150.00,
  },
  {
    uniqueKey: "instance1-50-75-78",
    storeId: 78,
    storeName: "Ristorante Azienda 1",
    amount: 250.00,
  },
  {
    uniqueKey: "instance1-50-76-79",
    storeId: 79,
    storeName: "Pizzeria Azienda 2",
    amount: 180.00,
  },
];

async function sendTestData(store: TestStore) {
  const payload = {
    uniqueKey: store.uniqueKey,
    idempotencyKey: `test-${store.storeId}-${Date.now()}`,
    jobDateTime: new Date().toISOString(),
    amount: store.amount,
    documentType: { title: "Scontrino" },
    store: {
      id: store.storeId,
      title: store.storeName,
      address: "Via Test 123",
      collective: "Milano",
      province: "MI",
    },
    rows: [
      {
        description: "Prodotto Test",
        price: store.amount,
        quantity: 1,
      },
    ],
  };

  console.log(`\nSending data for ${store.storeName} (${store.uniqueKey})...`);
  
  const response = await fetch(DATA_MAPPER_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-api-key": DATA_MAPPER_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    const result = await response.json();
    console.log(`Success: ${store.storeName} - ${result.id}`);
  } else {
    console.error(`Failed: ${store.storeName} - ${response.status}`);
    const error = await response.text();
    console.error(error);
  }
}

async function generateToken(uniqueKey: string, description: string) {
  console.log(`\nGenerating token for: ${description} (${uniqueKey})`);
  
  const response = await fetch(`${DATA_SERVICE_URL}/api/generate-embed-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uniqueKey,
      userId: `test-user-${uniqueKey}`,
    }),
  });

  if (response.ok) {
    const result = await response.json();
    console.log(`Token generated:`);
    console.log(`   URL: ${result.embedUrl}`);
    return result.token;
  } else {
    console.error(`Failed to generate token`);
    return null;
  }
}

async function testDataAccess(token: string, description: string) {
  console.log(`\nTesting data access for: ${description}`);
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const url = `${DATA_SERVICE_URL}/api/analytics/sales/overview?from=${yesterday.toISOString()}&to=${today.toISOString()}`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (response.ok) {
    const result = await response.json();
    console.log(`Data retrieved:`);
    console.log(`   Total Gross: €${result.kpis?.totalGross || 0}`);
    console.log(`   Total Sales: ${result.kpis?.totalSales || 0}`);
    console.log(`   Stores visible: ${result.table?.rows?.length || 0}`);
    
    if (result.table?.rows) {
      result.table.rows.forEach((row: any) => {
        console.log(`   - ${row.store || 'Unknown'}: €${row.totale || 0}`);
      });
    }
  } else {
    console.error(`Failed to retrieve data: ${response.status}`);
  }
}

async function main() {
  console.log("Starting Hierarchical uniqueKey Test\n");
  console.log("=" .repeat(60));

  // Step 1: Send test data for all stores
  console.log("\nSTEP 1: Creating test data for all stores");
  console.log("=" .repeat(60));
  
  for (const store of testStores) {
    await sendTestData(store);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
  }

  // Wait for data to be processed
  console.log("\nWaiting 2 seconds for data processing...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Test store-level access (single store)
  console.log("\n\nSTEP 2: Testing STORE-LEVEL access (instance1-50-75-77)");
  console.log("=" .repeat(60));
  console.log("Expected: Should see ONLY Bar Azienda 1 (€150)");
  
  const storeToken = await generateToken("instance1-50-75-77", "Store 77 only");
  if (storeToken) {
    await testDataAccess(storeToken, "Store 77 (Bar)");
  }

  // Step 3: Test company-level access (all stores in company)
  console.log("\n\nSTEP 3: Testing COMPANY-LEVEL access (instance1-50-75)");
  console.log("=" .repeat(60));
  console.log("Expected: Should see Bar (€150) + Ristorante (€250) = €400 total");
  
  const companyToken = await generateToken("instance1-50-75", "Company 75 (Azienda 1)");
  if (companyToken) {
    await testDataAccess(companyToken, "Company 75 (Azienda 1)");
  }

  // Step 4: Test group-level access (all stores in group)
  console.log("\n\nSTEP 4: Testing GROUP-LEVEL access (instance1-50)");
  console.log("=" .repeat(60));
  console.log("Expected: Should see all 3 stores (€150 + €250 + €180 = €580 total)");
  
  const groupToken = await generateToken("instance1-50", "Group 50 (Gruppo Enzo)");
  if (groupToken) {
    await testDataAccess(groupToken, "Group 50 (Gruppo Enzo)");
  }

  console.log("\n\nTest completed!");
  console.log("=" .repeat(60));
}

main().catch(console.error);
