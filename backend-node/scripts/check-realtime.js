const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const { randomUUID } = require('node:crypto');
const { createBusPublisher } = require('../services/supabase');

// Use an isolated private topic, never inject test data into the live bus channel.
const publisher = createBusPublisher({ topic: `mfu-check-${randomUUID()}` });
publisher.publishSnapshot(async () => []).then(result => {
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
});
