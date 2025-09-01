#!/usr/bin/env node
// Simple Realtime (WebSocket) smoke test.
// - Verifies OPENAI_API_KEY by connecting to gpt-realtime over WS
// - Sends a short text instruction and prints incoming frames
// - Optional: collects audio deltas into a WAV file for quick listening
// - Does not use your mic; for live voice, use the Live UI page

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import WebSocket from 'ws';

// Load parent monorepo .env (for OPENAI_API_KEY) and local .env
try { dotenv.config({ path: path.resolve(process.cwd(), '../.env') }); } catch {}
try { dotenv.config({ path: path.resolve(process.cwd(), '.env') }); } catch {}

const MODEL = process.env.TOKEN_AI_REALTIME_MODEL || 'gpt-realtime';
const PHRASE = process.argv.includes('--say')
  ? process.argv[process.argv.indexOf('--say') + 1]
  : 'Voice smoke test OK. If you can hear me, everything is wired correctly.';
const wavIndex = process.argv.indexOf('--wav');
const WAV_FLAG = wavIndex !== -1;
const OUT_WAV = WAV_FLAG && process.argv[wavIndex + 1] && !String(process.argv[wavIndex + 1]).startsWith('--')
  ? process.argv[wavIndex + 1]
  : '';
const AUDIO_ONLY = process.argv.includes('--audio-only') || WAV_FLAG; // if saving audio, prefer audio-only

function log(...a){
  const ts = new Date().toISOString().split('T')[1].replace('Z','');
  console.log(`[voice-smoke ${ts}]`, ...a);
}

// WAV helpers (PCM 16-bit mono, 24000 Hz)
function writeWav(filePath, pcmBuffer, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, pcmBuffer]));
}

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('OPENAI_API_KEY is not set. Export it or add it to ../.env');
  process.exit(1);
}

const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;
const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${key}`,
    'OpenAI-Beta': 'realtime=v1'
  },
});

const audioChunks = [];
const saveAudio = WAV_FLAG; // if --wav is present (with or without a filename), save audio

ws.on('open', () => {
  log('WS open');
  // Minimal session update: ask for audio+text modalities (server will stream audio deltas too)
  ws.send(JSON.stringify({
    type: 'session.update',
    session: { voice: 'verse', modalities: AUDIO_ONLY ? ['audio'] : ['audio','text'], output_audio_format: 'pcm16', turn_detection: { type:'server_vad' } }
  }));

  // Ask the model to speak a short phrase
  ws.send(JSON.stringify({
    type: 'response.create',
    response: {
      modalities: AUDIO_ONLY ? ['audio'] : ['audio','text'],
      instructions: AUDIO_ONLY ? `Speak the following phrase as synthesized speech only (no text tokens). Keep speaking for at least 2 seconds. Phrase: ${PHRASE}` : PHRASE,
      audio: { voice: 'verse', format: 'pcm16' }
    }
  }));
});

let frames = 0;
let responseStartedAt = null;
let inactivityTimer = null;
let sentRequest = false;
function armInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    log('No further frames; closing (inactivity timeout).');
    try { ws.close(); } catch {}
  }, 30000);
}

ws.on('message', (data, isBinary) => {
  try {
    // If audio arrives as raw binary frames, capture them here
    if (isBinary || Buffer.isBuffer(data)) {
      if (saveAudio) {
        audioChunks.push(Buffer.from(data));
      }
      frames++;
      armInactivityTimer();
      return;
    }

    const msg = JSON.parse(data.toString());
    frames++;
    const t = String(msg.type||'');
    if (!responseStartedAt && t.startsWith('response.')) responseStartedAt = Date.now();
    armInactivityTimer();
    if (t === 'session.updated' && !sentRequest) {
      // Only send response.create after the session update is acknowledged
      sentRequest = true;
      // Send the text as an input message to the conversation first
      ws.send(JSON.stringify({ type: 'conversation.input_text', text: PHRASE }));
      // Then ask for an audio-only response to the last user message
      ws.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: AUDIO_ONLY ? ['audio'] : ['audio','text'],
          instructions: AUDIO_ONLY ? 'Respond to the last user message using synthesized speech only. Do not emit text tokens. Speak clearly for at least 3 seconds.' : undefined,
          audio: { voice: 'verse', format: 'pcm16' }
        }
      }));
      return;
    }
    if (t === 'response.completed' || t === 'response.done') {
      // Save audio (if requested) and close shortly after completion
      if (saveAudio) {
        const outDir = path.resolve(process.cwd(), 'reports/voice-debug');
        fs.mkdirSync(outDir, { recursive: true });
        const fname = OUT_WAV || `voice-smoke-${Date.now()}.wav`;
        const abs = path.isAbsolute(fname) ? fname : path.join(outDir, fname);
        const pcm = Buffer.concat(audioChunks);
        if (pcm.length > 0) {
          writeWav(abs, pcm, 24000);
          log('WAV saved:', abs, `(bytes=${pcm.length})`);
        } else {
          log('No audio frames received; nothing to save.');
        }
      }
      log('Response completed. Closing.');
      try { if (inactivityTimer) clearTimeout(inactivityTimer); } catch {}
      setTimeout(()=> ws.close(), 500);
    } else if (t === 'response.delta') {
      if (msg.delta?.text) log('text.delta:', msg.delta.text);
    } else if (t === 'response.audio.delta' || t === 'response.output_audio.delta') {
      if (saveAudio && msg.audio) {
        const buf = Buffer.from(msg.audio, 'base64');
        audioChunks.push(buf);
      }
    } else {
      // Other frames are useful for debugging
      if (!t.startsWith('input') && !t.startsWith('response.audio')) log('event:', t);
    }
  } catch {}
});

ws.on('error', (err) => {
  console.error('WS error:', err?.message || err);
});

ws.on('close', () => {
  log('WS closed. Frames:', frames);
  if (saveAudio) {
    try {
      const outDir = path.resolve(process.cwd(), 'reports/voice-debug');
      fs.mkdirSync(outDir, { recursive: true });
      const abs = path.isAbsolute(OUT_WAV) ? OUT_WAV : path.join(outDir, OUT_WAV || `voice-smoke-${Date.now()}.wav`);
      const pcm = Buffer.concat(audioChunks);
      writeWav(abs, pcm, 24000);
      log('WAV saved:', abs, `(bytes=${pcm.length})`);
    } catch (e) {
      console.error('Failed to write WAV:', e?.message || e);
    }
  }
});
