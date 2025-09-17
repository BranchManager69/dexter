#!/usr/bin/env node

const tests = [
  {
    name: 'API health',
    url: 'https://api.dexter.cash/health',
    expect: (res) => res.ok === true,
  },
  {
    name: 'MCP health',
    url: 'https://dexter.cash/mcp/health',
    expect: (res) => res.ok === true,
  },
  {
    name: 'OIDC metadata',
    url: 'https://dexter.cash/.well-known/openid-configuration',
    expect: (res) => Boolean(res.authorization_endpoint && res.token_endpoint && res.userinfo_endpoint),
  },
];

async function run() {
  let failures = 0;
  for (const test of tests) {
    try {
      process.stdout.write(`→ ${test.name} ... `);
      const response = await fetch(test.url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!test.expect(data)) {
        throw new Error('unexpected response payload');
      }
      console.log('ok');
    } catch (err) {
      failures += 1;
      console.log('FAIL');
      console.error(`   ${err?.message || err}`);
    }
  }
  if (failures > 0) {
    console.error(`Smoke tests failed: ${failures}/${tests.length}`);
    process.exit(1);
  }
  console.log(`Smoke tests passed: ${tests.length}/${tests.length}`);
}

run();
