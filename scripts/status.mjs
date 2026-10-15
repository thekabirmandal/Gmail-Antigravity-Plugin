#!/usr/bin/env node

import { getStatus } from '../src/client.mjs';

async function main() {
  console.log('Checking Gmail Plugin authentication status...\n');
  const status = await getStatus();
  console.log(JSON.stringify(status, null, 2));
}

main().catch((err) => {
  console.error('Error checking status:', err);
  process.exit(1);
});
