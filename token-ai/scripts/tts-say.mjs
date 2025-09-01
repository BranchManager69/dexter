#!/usr/bin/env node
// Simple TTS via OpenAI Audio Speech (non-realtime) to verify longer audio generation.
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';

try { dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); } catch {}
try { dotenv.config({ path: path.resolve(process.cwd(), '.env') }); } catch {}

const textIndex = process.argv.indexOf('--say');
const TEXT = textIndex !== -1 ? process.argv[textIndex + 1] : 'This is a longer text to speech test from Clanka.';
const fmtIndex = process.argv.indexOf('--format');
const FORMAT = fmtIndex !== -1 ? (process.argv[fmtIndex + 1] || 'wav') : 'wav'; // wav or mp3
const outIndex = process.argv.indexOf('--out');
const OUT = outIndex !== -1 ? (process.argv[outIndex + 1] || '') : '';

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is not set.');
  process.exit(1);
}

const client = new OpenAI({ apiKey: key });

async function main(){
  const outDir = path.resolve(process.cwd(), 'reports/voice-debug');
  fs.mkdirSync(outDir, { recursive: true });
  const fname = OUT || `tts-${Date.now()}.${FORMAT === 'mp3' ? 'mp3' : 'wav'}`;
  const abs = path.isAbsolute(fname) ? fname : path.join(outDir, fname);
  const voice = process.env.TOKEN_AI_REALTIME_VOICE || 'verse';
  const model = 'gpt-4o-mini-tts';
  const resp = await client.audio.speech.create({ model, voice, input: TEXT, format: FORMAT });
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(abs, buf);
  console.log('TTS saved:', abs, `(bytes=${buf.length})`);
}

main().catch(e=>{ console.error('TTS error:', e?.message || e); process.exit(1); });

