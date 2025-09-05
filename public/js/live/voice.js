// public/js/live/voice.js
// WebRTC voice chat functionality for Live UI - handles OpenAI Realtime API connection

// Voice state
const voice = { 
  pc: null, 
  dc: null, 
  mic: null, 
  audio: null, 
  connecting: false, 
  connected: false, 
  muted: false 
};

// Bootstrap cache (ETag + data)
const boot = { 
  etag: null, 
  version: null, 
  model: null, 
  voice: null, 
  updated_at: null, 
  instructions: '', 
  tools: [] 
};

// Push-to-talk configuration
const PTT_KEY = 'v'; // hold-to-talk key
let pttActive = false;

// Voice HUD elements
let voiceBtn = null;
let voiceHud = null;
let voiceLog = null;
let msgInput = null;
let msgSend = null;

/**
 * Initialize voice functionality
 */
let voiceInitialized = false;
function initVoice() {
  if (voiceInitialized) return;
  voiceInitialized = true;
  voiceBtn = document.getElementById('voiceBtn');
  msgInput = document.getElementById('msgInput');
  msgSend = document.getElementById('msgSend');
  
  // Create voice HUD
  createVoiceHud();
  setupVoiceEventListeners();
  setupTextInput();
  setupPushToTalk();
  checkOpenAIKeyBanner();
}

/**
 * Create voice HUD overlay
 */
function createVoiceHud() {
  voiceHud = document.createElement('div');
  voiceHud.id = 'voiceHud';
  voiceHud.style.position = 'fixed';
  voiceHud.style.right = '10px';
  voiceHud.style.bottom = '10px';
  voiceHud.style.zIndex = '9999';
  voiceHud.style.maxWidth = '36vw';
  voiceHud.style.background = '#0f1117';
  voiceHud.style.border = '1px solid #1a1e27';
  voiceHud.style.borderRadius = '6px';
  voiceHud.style.padding = '8px 10px';
  voiceHud.style.display = 'none';
  voiceHud.innerHTML = '<div style="font-size:12px;color:#9fb2c8;margin-bottom:4px">Voice</div><div id="voiceLog" style="font-size:12px;line-height:1.35;white-space:pre-wrap;color:#e6edf3;max-height:28vh;overflow:auto"></div>';
  document.body.appendChild(voiceHud);
  voiceLog = voiceHud.querySelector('#voiceLog');
}

/**
 * Set voice status
 */
function voiceSetStatus(txt, cls) {
  try {
    if (voiceBtn) {
      voiceBtn.textContent = 'Voice: ' + txt;
      voiceBtn.classList.remove('ok', 'warn', 'bad');
      if (cls) voiceBtn.classList.add(cls);
    }
  } catch {}
  
  try { 
    if (window.LiveDebug?.vd) {
      window.LiveDebug.vd.setStatus(txt, cls); 
    }
  } catch {}
}

/**
 * Append text to voice log
 */
function voiceAppend(text) {
  try { 
    if (voiceHud && voiceLog) {
      voiceHud.style.display = 'block'; 
      voiceLog.textContent = (voiceLog.textContent || '') + text; 
      voiceLog.scrollTop = voiceLog.scrollHeight; 
    }
  } catch {}
  
  try { 
    if (window.LiveDebug?.vd?.verbose) {
      window.LiveDebug.vd.add('info', 'assistant.delta', { text: String(text || '').slice(0, 240) }); 
    }
  } catch {}
}

/**
 * Append line to voice log
 */
function voiceAppendLine(prefix, text) {
  try { 
    if (voiceHud && voiceLog) {
      voiceHud.style.display = 'block'; 
      const line = `${prefix}: ${text}\n`; 
      voiceLog.textContent = (voiceLog.textContent || '') + line; 
      voiceLog.scrollTop = voiceLog.scrollHeight; 
    }
  } catch {}
  
  try { 
    if (window.LiveDebug?.vd?.verbose && prefix === 'You') {
      window.LiveDebug.vd.add('info', 'user.transcript', { text: String(text || '').slice(0, 240) }); 
    }
  } catch {}
}

/**
 * Start voice connection
 */
async function startVoice() {
  if (voice.connecting || voice.connected) return;
  voice.connecting = true; 
  voiceSetStatus('Starting…', 'warn'); 
  
  if (window.LiveDebug?.vd) {
    window.LiveDebug.vd.add('info', 'startVoice()');
    // Animate the debug log expansion when voice starts
    const vdLog = document.getElementById('vdLog');
    if (vdLog) vdLog.classList.add('expanded');
  }
  
  try {
    const tokenHdr = {}; 
    try { 
      if (window.AGENT_TOKEN) tokenHdr['x-agent-token'] = String(window.AGENT_TOKEN); 
      if (window.X_USER_TOKEN) tokenHdr['x-user-token'] = String(window.X_USER_TOKEN); 
    } catch {}
    
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'POST /realtime/sessions');
    const r = await fetch(window.LiveUtils.api('/realtime/sessions'), { 
      method: 'POST', 
      headers: { 'content-type': 'application/json', ...tokenHdr }, 
      body: JSON.stringify({}) 
    });
    
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', '/realtime/sessions response', { status: r.status });
    
    if (!r.ok) {
      const responseText = await r.text();
      console.error('Voice session failed:', r.status, responseText);
      
      try { 
        const e = JSON.parse(responseText);
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('error', 'session mint failed', e); 
        if (e && e.error === 'missing_openai_key') { 
          voiceSetStatus('No Key', 'bad'); 
          window.LiveUtils.showToast('Set OPENAI_API_KEY for voice'); 
          return; 
        }
        voiceSetStatus(`Error: ${e.error || r.status}`, 'bad');
        window.LiveUtils.showToast(`Voice failed: ${e.error || responseText}`);
      } catch (e2) { 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('error', 'session mint failed (no JSON)', { response: responseText }); 
        voiceSetStatus(`Error ${r.status}`, 'bad');
        window.LiveUtils.showToast(`Voice error ${r.status}: ${responseText}`);
      }
      return;
    }
    
    const j = await r.json();
    const eph = j?.client_secret?.value || '';
    
    if (window.LiveDebug?.vd) {
      window.LiveDebug.vd.add('info', 'session minted', { 
        id: j?.id, 
        model: j?.model, 
        expires_at: j?.expires_at, 
        token: eph ? (eph.slice(0, 8) + '…' + eph.slice(-6)) : null 
      });
      try { 
        if (j?.mcp && j.mcp.host) window.LiveDebug.vd.add('info', 'MCP attached', { host: j.mcp.host }); 
      } catch {}
    }
    
    if (!j?.ok || !eph) { 
      voiceSetStatus('Error', 'bad'); 
      return; 
    }
    
    const model = j.model || 'gpt-realtime';

    const pc = new RTCPeerConnection();
    voice.pc = pc; 
    voice.audio = new Audio(); 
    voice.audio.autoplay = true; 
    voice.audio.playsInline = true;
    
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'RTCPeerConnection created');
    
    try { 
      const mb = document.getElementById('modelbar'); 
      if (mb) mb.textContent = `Model: ${model} • Voice: ${j.voice || 'verse'}`; 
    } catch {}

    // Handle remote audio
    pc.ontrack = (e) => {
      try { 
        voice.audio.srcObject = e.streams[0]; 
        voice.audio.play().catch(() => {}); 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'ontrack: audio stream attached'); 
      } catch { 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('warn', 'ontrack: attach failed'); 
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'iceConnectionState', { state: s });
      if (s === 'connected') { 
        voice.connected = true; 
        voiceSetStatus('On', 'ok'); 
      }
      if (s === 'failed' || s === 'disconnected' || s === 'closed') { 
        stopVoice(); 
      }
    };
    
    pc.onconnectionstatechange = () => { 
      try { 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'connectionState', { state: pc.connectionState }); 
      } catch {} 
    };

    // Data channel for events
    const dc = pc.createDataChannel('oai-events');
    voice.dc = dc;
    
    dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handleVoiceMessage(msg);
      } catch (e) { 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('warn', 'dc non-JSON message', { size: (ev?.data?.length || 0) }); 
      }
    };
    
    dc.onopen = () => { if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'dc open'); };
    dc.onclose = () => { if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'dc close'); };

    // Microphone
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'requesting mic');
    const ms = await navigator.mediaDevices.getUserMedia({ 
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
    });
    voice.mic = ms;
    for (const track of ms.getAudioTracks()) { 
      pc.addTrack(track, ms); 
    }
    
    try { 
      const dev = ms.getAudioTracks()[0]; 
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', 'mic ready', { 
          label: dev?.label || '', 
          enabled: dev?.enabled, 
          muted: dev?.muted 
        }); 
      }
    } catch {}
    
    // Receive audio back
    pc.addTransceiver('audio', { direction: 'recvonly' });

    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'creating offer');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    if (window.LiveDebug?.vd) {
      window.LiveDebug.vd.add('info', 'localDescription set', { 
        sdp: window.LiveDebug.vd.verbose ? offer.sdp.slice(0, 120) + '…' : undefined 
      });
    }
    
    const sdpResp = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${eph}`,
        'content-type': 'application/sdp',
        'openai-beta': 'realtime=v1',
      },
      body: offer.sdp,
    });
    
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'SDP POST response', { status: sdpResp.status });
    
    if (!sdpResp.ok) { 
      voiceSetStatus('Error', 'bad'); 
      try { 
        const t = await sdpResp.text(); 
        if (window.LiveDebug?.vd) window.LiveDebug.vd.add('error', 'SDP error body', { text: t.slice(0, 800) }); 
      } catch {}
      stopVoice(); 
      return; 
    }
    
    const answer = await sdpResp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer }); 
    
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'remoteDescription set');

    // Once DC opens, fetch bootstrap and send session.update
    dc.onopen = async () => {
      await setupVoiceSession(dc, j, model);
      // Flush any queued typed prompts
      try {
        const q = Array.isArray(window.LiveVoice?._queuedText) ? window.LiveVoice._queuedText.slice() : [];
        window.LiveVoice._queuedText = [];
        for (const t of q) {
          sendTextMessage(String(t));
        }
      } catch {}
    };

    voice.connecting = false; 
    voiceSetStatus('On', 'ok'); 
    if (voiceHud) voiceHud.style.display = 'block';
    
  } catch (e) {
    if (window.LiveDebug?.vd) {
      window.LiveDebug.vd.add('error', 'startVoice failed', { error: String(e?.message || e) });
    }
    voice.connecting = false; 
    voiceSetStatus('Error', 'bad');
  }
}

/**
 * Setup voice session with bootstrap and tools
 */
async function setupVoiceSession(dc, sessionInfo, model) {
  try {
    const hdr = {}; 
    if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
    if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
    
    // Conditional fetch with ETag
    if (boot.etag) hdr['If-None-Match'] = String(boot.etag);
    const r = await fetch(window.LiveUtils.api('/realtime/bootstrap'), { headers: hdr, cache: 'no-cache' });
    
    let b = null;
    if (r.status === 304) {
      b = { 
        model: boot.model, 
        voice: boot.voice, 
        version: boot.version, 
        updated_at: boot.updated_at, 
        instructions: boot.instructions, 
        tools: boot.tools 
      };
    } else {
      b = await r.json().catch(() => ({}));
      boot.etag = r.headers.get('etag') || (b?.version ? `W/"${b.version}"` : null);
      boot.model = b?.model || model;
      boot.voice = sessionInfo.voice || 'verse';
      boot.version = b?.version || null;
      boot.updated_at = b?.updated_at || Date.now();
      boot.instructions = b?.instructions || '';
      boot.tools = Array.isArray(b?.tools) ? b.tools : [];
    }
    
    try {
      const mb = document.getElementById('modelbar');
      if (mb) {
        mb.textContent = `Model: ${boot.model} • Voice: ${boot.voice}${boot.version ? ` • Tools v${boot.version}` : ''}`;
        const updated = (new Date(boot.updated_at || Date.now())).toUTCString();
        mb.title = `Model: ${boot.model}\nVoice: ${boot.voice}\nTools: v${boot.version || '-'}\nUpdated: ${updated}`;
      }
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', 'bootstrap', { 
          model: boot.model, 
          voice: boot.voice, 
          tools: boot.tools.length, 
          version: boot.version 
        });
      }
    } catch {}
    
    const frame = { 
      type: 'session.update', 
      session: { 
        instructions: boot.instructions, 
        turn_detection: { type: 'server_vad' }, 
        voice: boot.voice, 
        modalities: ['audio', 'text'], 
        tool_choice: 'auto',
        // Improve visibility and reliability by enabling input transcription.
        // The server may stream transcript events we log below.
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' }
      } 
    };
    
    dc.send(JSON.stringify(frame)); 
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'session.update sent', { has_instructions: !!boot.instructions });
    
    if (boot.tools.length) {
      // Defer sending tools until after MCP attach so we can combine both sets
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'tools loaded', { n: boot.tools.length });
    }
    
    // Attach MCP via proxy
    try {
      let minted = null;
      try {
        const hdr = { 'accept': 'application/json' };
        try { 
          const at = window.SUPABASE?.session?.access_token; 
          if (at) hdr['authorization'] = `Bearer ${at}`; 
        } catch {}
        const r = await fetch(window.LiveUtils.api('/mcp-user-token'), { headers: hdr, cache: 'no-cache' });
        if (r.ok) { 
          const j = await r.json().catch(() => null); 
          minted = j?.token || null; 
        }
      } catch {}
      
      let mcpPath = '/mcp-proxy';
      const tok = minted || (window.X_USER_TOKEN || '');
      if (tok) mcpPath += `?userToken=${encodeURIComponent(String(tok))}`;
      const absProxy = new URL(window.LiveUtils.api(mcpPath), location.origin).toString();
      const toolsAll = Array.isArray(boot.tools) ? boot.tools.slice() : [];
      toolsAll.push({ type: 'mcp', server_label: 'token-ai', server_url: absProxy, require_approval: 'never' });
      const combined = { type: 'session.update', session: { tools: toolsAll } };
      dc.send(JSON.stringify(combined));
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('info', 'mcp attached', { url: absProxy, minted: !!minted });
        window.LiveDebug.vd.add('info', 'tools registered', { n: toolsAll.length });
      }
    } catch (e) { 
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('warn', 'mcp attach failed', { error: String(e?.message || e) }); 
    }
    
  } catch (e) { 
    if (window.LiveDebug?.vd) {
      window.LiveDebug.vd.add('error', 'bootstrap/session.update failed', { error: String(e?.message || e) }); 
    }
  }
}

/**
 * Handle incoming voice messages
 */
function handleVoiceMessage(msg) {
  // Assistant text deltas (text modality)
  if ((msg.type === 'response.delta' || msg.type === 'response.output_text.delta' || msg.type === 'response.text.delta') && typeof (msg.delta || msg.text) === 'string') {
    const seg = msg.delta || msg.text;
    voiceAppend(seg);
    // Buffer assistant text transcript; log once on response.text.done
    try { window.LiveVoice._bufText = (window.LiveVoice._bufText || '') + String(seg); } catch {}
  }

  // Assistant audio transcript deltas (audio modality)
  if (msg.type === 'response.audio_transcript.delta' && typeof (msg.delta || msg.text || msg.transcript) === 'string') {
    const seg = msg.delta || msg.text || msg.transcript;
    voiceAppend(seg);
    // Buffer assistant audio transcript; log once on response.audio_transcript.done
    try { window.LiveVoice._bufAudio = (window.LiveVoice._bufAudio || '') + String(seg); } catch {}
  }
  
  if (msg.type === 'response.completed') voiceAppend('\n');
  
  // User transcript extraction
  try {
    if (msg.type === 'conversation.item.created' && msg.item && msg.item.role === 'user') {
      const parts = Array.isArray(msg.item.content) ? msg.item.content : [];
      for (const c of parts) {
        const text = c?.text || c?.value || '';
        const ttype = String(c?.type || '');
        if (text && (ttype.includes('input') || ttype.includes('transcript') || ttype.includes('text'))) {
          voiceAppendLine('You', text);
          if (window.LiveDebug?.vd?.verbose) {
            window.LiveDebug.vd.add('info', 'user.transcript', { text: text.slice(0, 240) });
          }
          try { if (window.LiveTools) window.LiveTools._lastUserTranscript = String(text); } catch {}
          try { 
            if (window.LiveTools?.checkPendingConfirm) {
              window.LiveTools.checkPendingConfirm(text); 
            }
          } catch {}
        }
      }
    }
    
    // User input audio transcription (not assistant audio transcript)
    if ((msg.type || '').startsWith('conversation.item.input_audio_transcription') && (msg.text || msg.transcript)) {
      const t = msg.text || msg.transcript; 
      voiceAppendLine('You', String(t));
      if (window.LiveDebug?.vd?.verbose) {
        window.LiveDebug.vd.add('info', 'user.transcript', { text: String(t).slice(0, 240) });
      }
      try { if (window.LiveTools) window.LiveTools._lastUserTranscript = String(t); } catch {}
      try { 
        if (window.LiveTools?.checkPendingConfirm) {
          window.LiveTools.checkPendingConfirm(t); 
        }
      } catch {}
    }
  } catch {}
  
  // Surface MCP tool import completion once the list arrives
  try {
    if (msg.type === 'response.output_item.added' && msg.item && (msg.item.type === 'mcp_list_tools' || msg.item.type === 'mcp_list_tools.completed')) {
      const n = Array.isArray(msg.item.tools) ? msg.item.tools.length : (Array.isArray(msg.item?.content?.tools) ? msg.item.content.tools.length : undefined);
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'mcp tools imported', { count: n });
    }
  } catch {}

  // Log tool-related frames and unknown types (reduce noise: keep only tool frames when not verbose)
  const t = String(msg.type || '');
  // Always show tool frames
  if (t.startsWith('response.function_call') || t.startsWith('response.mcp_call')) {
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'tool-frame', { type: t });
  } else if (window.LiveDebug?.vd?.verbose) {
    // In verbose mode, include generic frames (except super-noisy deltas)
    if (t !== 'response.audio_transcript.delta' && t !== 'response.text.delta' && t !== 'response.delta') {
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'frame', { type: t });
    }
  }
  
  if (t === 'error') {
    try { 
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('error', 'realtime error', msg?.error || msg); 
    } catch { 
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('error', 'realtime error'); 
    }
  }
  
  // Handle tool/MCP frames (arguments delta, completion, etc.)
  if (window.LiveTools?.handleToolFrames) {
    window.LiveTools.handleToolFrames(msg);
  }

  // Treat response.done as a completion marker too
  if (t === 'response.done') {
    try { voiceAppend('\n'); } catch {}
  }

  // Flush buffered assistant transcripts on done markers
  try {
    if (t === 'response.audio_transcript.done' && window.LiveVoice?._bufAudio) {
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'assistant.transcript', { text: window.LiveVoice._bufAudio });
      window.LiveVoice._bufAudio = '';
    }
    if (t === 'response.text.done' && window.LiveVoice?._bufText) {
      if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'assistant.transcript', { text: window.LiveVoice._bufText });
      window.LiveVoice._bufText = '';
    }
  } catch {}
}

/**
 * Stop voice connection
 */
function stopVoice() {
  if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'stopVoice()');
  
  try { if (voice.dc) { try { voice.dc.close(); } catch {} } } catch {}
  try { if (voice.pc) { try { voice.pc.close(); } catch {} } } catch {}
  try { if (voice.mic) { for (const t of voice.mic.getTracks()) { try { t.stop(); } catch {} } } } catch {}
  
  voice.pc = null; 
  voice.dc = null; 
  voice.mic = null; 
  voice.connected = false; 
  voice.connecting = false;
  voiceSetStatus('Off');
  
  // Keep the debug log visible after stop so users don't lose context
  // (was collapsing the panel, which forced extra clicks to re-open)
  // const vdLog = document.getElementById('vdLog');
  // if (vdLog) vdLog.classList.remove('expanded');
}

/**
 * Set microphone enabled state
 */
function setMicEnabled(on) { 
  try { 
    const tr = voice?.mic?.getAudioTracks?.[0]; 
    if (tr) tr.enabled = !!on; 
    voice.muted = !on; 
    voiceSetStatus(
      voice.connected ? (on ? 'On' : 'Muted') : (voice.connecting ? 'Starting…' : 'Off'), 
      on ? 'ok' : 'warn'
    ); 
  } catch {} 
}

/**
 * Setup voice event listeners
 */
function setupVoiceEventListeners() {
  try {
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => { 
        // Ensure debug panel opens immediately on first click
        try { const vdLog = document.getElementById('vdLog'); if (vdLog) vdLog.classList.add('expanded'); } catch {}
        if (voice.connected || voice.connecting) { 
          stopVoice(); 
        } else { 
          startVoice(); 
        } 
      });
    }
  } catch {}
}

/**
 * Setup typed text input (sends messages over Realtime DC)
 */
function setupTextInput() {
  try {
    if (msgSend) {
      msgSend.addEventListener('click', () => {
        const t = (msgInput?.value || '').trim();
        if (!t) return;
        sendTextMessage(t);
        msgInput.value = '';
      });
    }
    if (msgInput) {
      msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const t = (msgInput?.value || '').trim();
          if (!t) return;
          sendTextMessage(t);
          msgInput.value = '';
        }
      });
    }
  } catch {}
}

/**
 * Queue and send a typed text prompt through Realtime
 */
function sendTextMessage(text) {
  try {
    // Open debug panel for visibility
    try { const vdLog = document.getElementById('vdLog'); if (vdLog) vdLog.classList.add('expanded'); } catch {}
    const t = String(text || '').trim();
    if (!t) return;
    // If not connected yet, start voice then queue
    if (!voice.connected || !voice.dc || voice.dc.readyState !== 'open') {
      window.LiveVoice._queuedText = window.LiveVoice._queuedText || [];
      window.LiveVoice._queuedText.push(t);
      // Start voice if not already starting
      if (!voice.connecting && !voice.connected) startVoice();
      return;
    }
    // Create a user message and ask for a response
    try {
      voice.dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [ { type: 'input_text', text: t } ]
        }
      }));
      voice.dc.send(JSON.stringify({ type: 'response.create' }));
    } catch {}
    // Reflect in local HUD and debug
    voiceAppendLine('You', t);
    if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'user.transcript', { text: t });
    try { if (window.LiveTools?.checkPendingConfirm) window.LiveTools.checkPendingConfirm(t); } catch {}
  } catch {}
}

/**
 * Setup push-to-talk functionality
 */
function setupPushToTalk() {
  try {
    window.addEventListener('keydown', (e) => {
      if (e.key && e.key.toLowerCase() === PTT_KEY) {
        if (!pttActive) {
          pttActive = true; 
          setMicEnabled(true); 
          if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'ptt down');
          try { 
            voice.dc?.send(JSON.stringify({ type: 'response.cancel' })); 
            if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'barge-in: response.cancel sent'); 
          } catch {}
        }
      }
    }, true);
    
    window.addEventListener('keyup', (e) => {
      if (e.key && e.key.toLowerCase() === PTT_KEY) { 
        if (pttActive) { 
          pttActive = false; 
          setMicEnabled(false); 
          if (window.LiveDebug?.vd) window.LiveDebug.vd.add('info', 'ptt up'); 
        } 
      }
    }, true);
  } catch {}
}

/**
 * Check for OpenAI key banner
 */
function checkOpenAIKeyBanner() {
  try { 
    if (typeof window.OPENAI_KEY_PRESENT !== 'undefined' && !window.OPENAI_KEY_PRESENT) { 
      const vb = document.getElementById('voiceBanner'); 
      if (vb) vb.style.display = 'block'; 
    } 
  } catch {}
}

// Export voice functionality
window.LiveVoice = {
  voice,
  boot,
  startVoice,
  stopVoice,
  voiceSetStatus,
  voiceAppend,
  voiceAppendLine,
  setMicEnabled,
init: initVoice
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoice);
} else {
  initVoice();
}
