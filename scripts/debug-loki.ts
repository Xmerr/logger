/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/explicit-function-return-type */
/**
 * Debug script to test Loki connectivity directly
 * Run with: npx tsx scripts/debug-loki.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually
const envPath = resolve(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const LOKI_HOST = process.env.LOKI_HOST;
const LOKI_USERNAME = process.env.LOKI_USERNAME;
const LOKI_PASSWORD = process.env.LOKI_PASSWORD;

console.log('=== Loki Debug Script ===\n');
console.log('Config:');
console.log(`  LOKI_HOST: ${LOKI_HOST}`);
console.log(`  LOKI_USERNAME: ${LOKI_USERNAME ? '***' : '(not set)'}`);
console.log(`  LOKI_PASSWORD: ${LOKI_PASSWORD ? '***' : '(not set)'}`);
console.log('');

async function testLokiConnection() {
  if (!LOKI_HOST) {
    console.error('❌ LOKI_HOST not set');
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (LOKI_USERNAME && LOKI_PASSWORD) {
    const auth = Buffer.from(`${LOKI_USERNAME}:${LOKI_PASSWORD}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  // Test 1: Check if Loki is reachable (ready endpoint)
  console.log('Test 1: Checking Loki ready endpoint...');
  try {
    const readyRes = await fetch(`${LOKI_HOST}/ready`, { headers });
    console.log(`  Status: ${readyRes.status} ${readyRes.statusText}`);
    if (readyRes.ok) {
      console.log('  ✅ Loki is reachable\n');
    } else {
      console.log(`  ⚠️ Unexpected response: ${await readyRes.text()}\n`);
    }
  } catch (err) {
    console.log(`  ❌ Failed to reach Loki: ${(err as Error).message}\n`);
    return;
  }

  // Test 2: Push a test log entry
  console.log('Test 2: Pushing test log entry...');
  const timestamp = (Date.now() * 1_000_000).toString(); // nanoseconds
  const payload = {
    streams: [
      {
        stream: {
          job: 'debug-script',
          app: 'loki-test',
        },
        values: [[timestamp, JSON.stringify({ msg: 'Test log from debug script', timestamp: new Date().toISOString() })]],
      },
    ],
  };

  try {
    const pushRes = await fetch(`${LOKI_HOST}/loki/api/v1/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    console.log(`  Status: ${pushRes.status} ${pushRes.statusText}`);
    if (pushRes.status === 204) {
      console.log('  ✅ Successfully pushed log to Loki\n');
    } else {
      const body = await pushRes.text();
      console.log(`  ❌ Push failed: ${body}\n`);
      return;
    }
  } catch (err) {
    console.log(`  ❌ Failed to push: ${(err as Error).message}\n`);
    return;
  }

  // Test 3: Query to verify the log was stored
  console.log('Test 3: Querying for test log...');
  await new Promise(r => setTimeout(r, 1000)); // Wait for indexing

  try {
    const queryUrl = new URL(`${LOKI_HOST}/loki/api/v1/query`);
    queryUrl.searchParams.set('query', '{job="debug-script"}');
    queryUrl.searchParams.set('limit', '1');

    const queryRes = await fetch(queryUrl.toString(), { headers });
    console.log(`  Status: ${queryRes.status} ${queryRes.statusText}`);

    if (queryRes.ok) {
      const data = await queryRes.json() as { data?: { result?: unknown[] } };
      if (data.data?.result && data.data.result.length > 0) {
        console.log('  ✅ Log found in Loki!\n');
        console.log('  Result:', JSON.stringify(data.data.result, null, 2));
      } else {
        console.log('  ⚠️ No logs found (may need more time to index)\n');
      }
    } else {
      console.log(`  ❌ Query failed: ${await queryRes.text()}\n`);
    }
  } catch (err) {
    console.log(`  ❌ Query error: ${(err as Error).message}\n`);
  }
}

// Test 4: Test pino-loki transport directly
async function testPinoLoki() {
  console.log('\nTest 4: Testing pino-loki transport...');

  const pino = (await import('pino')).default;

  const transport = pino.transport({
    targets: [
      {
        target: 'pino-loki',
        options: {
          host: LOKI_HOST,
          basicAuth: LOKI_USERNAME && LOKI_PASSWORD
            ? { username: LOKI_USERNAME, password: LOKI_PASSWORD }
            : undefined,
          labels: { job: 'pino-loki-test', app: 'debug-script' },
          batching: false,
        },
      },
      {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    ],
  });

  const logger = pino({ level: 'info' }, transport);

  console.log('  Sending test log via pino-loki...');
  logger.info({ test: true, timestamp: Date.now() }, 'Test message from pino-loki');

  // Give transport time to send
  await new Promise(r => setTimeout(r, 2000));

  console.log('  ✅ Log sent (check Loki for job="pino-loki-test")\n');

  // Flush and close
  transport.end();
  await new Promise(r => setTimeout(r, 500));
}

async function main() {
  await testLokiConnection();
  await testPinoLoki();

  console.log('\n=== Debug Complete ===');
  console.log('Run this query to check all test logs:');
  console.log(`  curl -u ${LOKI_USERNAME}:*** "${LOKI_HOST}/loki/api/v1/query" --data-urlencode 'query={job=~"debug-script|pino-loki-test"}' | jq`);
}

main().catch(console.error);
