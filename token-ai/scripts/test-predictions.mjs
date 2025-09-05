#!/usr/bin/env node
// Quick MCP test for predictions/media/history using a known tweet id and optional mint
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function parseArgs() {
  const out = { tweet: process.env.TWEET_ID || '1956196249452916913', mint: process.env.MINT || '', minutes: Number(process.env.MINUTES || 1440) };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--(tweet|mint|minutes)=(.+)$/);
    if (m) {
      if (m[1] === 'minutes') out.minutes = Number(m[2]);
      else out[m[1]] = m[2];
    }
  }
  return out;
}

async function main(){
  const { tweet, mint, minutes } = parseArgs();
  console.log('tweet_id:', tweet, 'mint:', mint || '(none)', 'minutes_after:', minutes);
  const transport = new StdioClientTransport({ command: 'node', args: [path.join(ROOT, 'mcp', 'server.mjs')], cwd: ROOT, stderr: 'pipe' });
  const client = new Client({ name: 'mcp-predictions-test', version: '0.1.0' }, { capabilities: { tools:{}, resources:{}, prompts:{}, logging:{} } });
  await client.connect(transport);

  const call = async (name, args) => {
    try {
      const res = await client.callTool({ name, arguments: args });
      return res.structuredContent ?? res;
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  };

  // Media by tweet
  const media = await call('get_media_from_tweet', { tweet_id: tweet, include_metadata: true });
  console.log('\nget_media_from_tweet:', JSON.stringify(media).slice(0, 500));

  // Verify single prediction
  const verifyArgs = { tweet_id: tweet, minutes_after: minutes };
  if (mint) verifyArgs.mint_address = mint;
  const verify = await call('verify_tweet_prediction', verifyArgs);
  console.log('\nverify_tweet_prediction:', JSON.stringify(verify).slice(0, 800));

  // History (if mint provided)
  if (mint) {
    const hist = await call('get_twitter_history', { mint_address: mint, limit: 5, include_snapshots: true, since_days: 14 });
    console.log('\nget_twitter_history:', JSON.stringify(hist).slice(0, 800));
  } else {
    console.log('\nskip get_twitter_history (no --mint provided)');
  }

  await client.close();
  await transport.close();
}

main().catch((e)=>{ console.error('test-predictions error:', e?.message || e); process.exit(1); });

