const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe('API smoke', () => {
  let server;
  let base;

  before(async () => {
    ({ server, base } = await listen(createApp()));
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  it('GET /api/health', async () => {
    const { status, body } = await jsonFetch(`${base}/api/health`);
    assert.equal(status, 200);
    assert.deepEqual(body, { status: 'ok', service: 'cliff-guard-api' });
  });

  it('GET /api/demo/scenarios defaults to 30-day first', async () => {
    const { status, body } = await jsonFetch(`${base}/api/demo/scenarios`);
    assert.equal(status, 200);
    assert.equal(body.scenarios[0].id, 'demo-30day');
    assert.equal(body.scenarios[0].recordCount, 720);
  });

  it('GET /api/demo/readings omits injected spike field', async () => {
    const { status, body } = await jsonFetch(
      `${base}/api/demo/readings?scenarioId=demo-30day`
    );
    assert.equal(status, 200);
    assert.equal(body.intervalConvention, 'timestamp-is-interval-start');
    assert.equal(body.records.length, 720);
    assert.ok(!('is_injected_spike' in body.records[0]));
    assert.ok(!('isInjectedSpike' in body.records[0]));
  });

  it('GET /api/tariff returns illustrative profile from config', async () => {
    const { status, body } = await jsonFetch(`${base}/api/tariff`);
    assert.equal(status, 200);
    assert.equal(body.profileId, 'kseb-domestic-demo');
    assert.equal(body.verificationStatus, 'illustrative');
    assert.ok(Array.isArray(body.periods));
    assert.ok(Array.isArray(body.thresholds));
  });

  it('POST /api/analyze computes dynamic summary', async () => {
    const { status, body } = await jsonFetch(`${base}/api/analyze`, {
      method: 'POST',
      body: JSON.stringify({
        scenarioId: 'demo-30day',
        tariffProfileId: 'kseb-domestic-demo',
      }),
    });
    assert.equal(status, 200);
    assert.equal(body.recordCount, 720);
    assert.ok(body.summary.totalKwh > 100);
    assert.ok(body.forecast.available);
    assert.equal(body.forecast.method, 'average-daily-usage projection');
  });

  it('POST /api/advice returns fallback without API key', async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const { status, body } = await jsonFetch(`${base}/api/advice`, {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: 'demo-30day',
          tariffProfileId: 'kseb-domestic-demo',
          question: 'What should I try changing?',
          selectedFindingIds: [],
        }),
      });
      assert.equal(status, 200);
      assert.equal(body.provider, 'fallback');
      assert.ok(Array.isArray(body.insights));
      assert.ok(body.disclaimer);
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
