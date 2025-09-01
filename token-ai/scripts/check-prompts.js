#!/usr/bin/env node

// Quick prompt inspector: assembles the system prompt with optional flags and prints to stdout.

import { buildSystemPrompt } from '../core/prompts.js';

const ARGS = process.argv.slice(2);

function getFlagValue(name) {
  for (let i = 0; i < ARGS.length; i++) {
    const a = ARGS[i];
    if (a === `--${name}`) return ARGS[i + 1];
    if (a.startsWith(`--${name}=`)) return a.split('=')[1];
  }
  return undefined;
}
function getBoolFlag(name, def = false) {
  if (ARGS.includes(`--${name}`)) return true;
  if (ARGS.includes(`--no-${name}`)) return false;
  const v = getFlagValue(name);
  if (v === undefined) return def;
  const s = String(v).toLowerCase();
  if (["1","true","yes","on"].includes(s)) return true;
  if (["0","false","no","off"].includes(s)) return false;
  return def;
}

const voice = getFlagValue('voice');
const domain = getFlagValue('domain');
const overrides = getFlagValue('overrides');
const privateFile = getFlagValue('private');
const skipOhlcv = getBoolFlag('skip-ohlcv', false) || getBoolFlag('no-ohlcv', false);

// Optional memory sources
const tokenAddress = getFlagValue('token');
const digestScope = getFlagValue('digest-scope') || 'general';
const digestChars = Number(getFlagValue('digest-chars') || 1200);
let agentMemoryText = getFlagValue('memory') || '';

// If a token address is provided and memory not given, try to load store and build digest
async function main() {
  try {
    if (tokenAddress && !agentMemoryText) {
      try {
        const reg = await import('../agents/registry.js');
        const mem = await import('../agents/memory.js');
        const state = reg.loadAgentState(tokenAddress);
        agentMemoryText = mem.buildScopedDigest(state, digestScope, Math.max(200, digestChars));
      } catch {}
    }
  } catch {}

  const prompt = buildSystemPrompt({ skipOhlcv, agentMemoryText, voice, domain, overrides, privateFile });

// Optional convenience: head/tail slicing for quick reads
const head = Number(getFlagValue('head') || 0);
const tail = Number(getFlagValue('tail') || 0);

if (head > 0) {
  console.log(prompt.split('\n').slice(0, head).join('\n'));
} else if (tail > 0) {
  console.log(prompt.split('\n').slice(-tail).join('\n'));
} else {
  console.log(prompt);
}
}

await main();
