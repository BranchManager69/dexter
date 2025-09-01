// public/js/live/status.js
// Lightweight status bar helpers: connection badge updates and sticky now text for WS events.

function updateConn(state){
  try {
    const cb = document.getElementById('connbar');
    if (!cb) return;
    const cls = state === 'ok' ? 'ok' : (state === 'warn' ? 'warn' : 'bad');
    cb.textContent = state === 'ok' ? 'Connected' : (state === 'warn' ? 'Reconnecting' : 'Disconnected');
    cb.classList.remove('ok','warn','bad');
    cb.classList.add(cls);
    const pulse = (cls==='ok'?'pulse-ok':(cls==='warn'?'pulse-warn':'pulse-bad'));
    cb.classList.add(pulse);
    setTimeout(()=>{ try { cb.classList.remove(pulse); } catch {} }, 500);
  } catch {}
}

window.addEventListener('ai:ws:open', ()=>{ updateConn('ok'); });
window.addEventListener('ai:ws:close', ()=>{ updateConn('warn'); });

