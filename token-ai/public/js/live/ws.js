// public/js/live/ws.js
// Central WebSocket connector for Live UI; dispatches custom events:
//  - 'ai:ws:open' / 'ai:ws:close'
//  - 'ai:terminal' with { msg }

function computeWsUrl(){
  try {
    const url = new URL(window.location.href);
    const override = url.searchParams.get('ws');
    if (override) return override;
    const proto = (url.protocol === 'https:') ? 'wss:' : 'ws:';
    return `${proto}//${url.host}/ws`;
  } catch { return 'ws://localhost:3013/ws'; }
}

let ws = null;
let pingIv = null;
let attempts = 0;
const PING_MS = 25000;
const MAX_BACKOFF = 30000;

function clearTimers(){ try { if (pingIv) { clearInterval(pingIv); pingIv = null; } } catch {}
}

function schedReconnect(){
  const delay = Math.min(1000 * Math.pow(2, attempts++), MAX_BACKOFF);
  setTimeout(connect, delay);
}

function connect(){
  try { if (ws) { try { ws.close(); } catch {} } } catch {}
  ws = new WebSocket(computeWsUrl());
  ws.addEventListener('open', () => {
    attempts = 0;
    try { ws.send(JSON.stringify({ type:'SUBSCRIBE', topic:'terminal' })); } catch {}
    clearTimers();
    pingIv = setInterval(() => {
      try { ws && ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type:'PING', t: Date.now() })); } catch {}
    }, PING_MS);
    window.dispatchEvent(new CustomEvent('ai:ws:open'));
  });
  ws.addEventListener('close', () => {
    clearTimers();
    window.dispatchEvent(new CustomEvent('ai:ws:close'));
    schedReconnect();
  });
  ws.addEventListener('error', () => { /* close handler will retry */ });
  ws.addEventListener('message', (ev) => {
    try { const msg = JSON.parse(ev.data); window.dispatchEvent(new CustomEvent('ai:terminal', { detail: { msg } })); } catch {}
  });
}

connect();

