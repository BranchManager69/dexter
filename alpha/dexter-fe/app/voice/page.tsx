'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';

// Use relative API path; NGINX proxies /api/* to the backend API

export default function VoicePage() {
  const [status, setStatus] = useState<'idle'|'connecting'|'connected'|'error'>('idle');
  const [debug, setDebug] = useState<string>('');
  const sessionRef = useRef<RealtimeSession | null>(null);

  const log = useCallback((label: string, data?: any) => {
    try {
      const ts = new Date().toISOString();
      const line = data === undefined ? label : `${label} ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
      setDebug(prev => `${prev}${prev ? '\n' : ''}[${ts}] ${line}`);
      console.log('[voice]', label, data);
    } catch {}
  }, []);

  async function connectRawWebRTC(clientSecret: string, model: string) {
    log('raw webrtc: starting handshake');
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    pc.ontrack = (e) => {
      try { audioEl.srcObject = e.streams[0]; } catch {}
      document.body.appendChild(audioEl);
      log('raw webrtc: remote track received');
    };
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    media.getTracks().forEach((t) => pc.addTrack(t, media));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpOffer = offer.sdp || '';
    log('raw webrtc: created offer', sdpOffer.slice(0, 80) + '...');
    const doPost = async (url: string) => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
        body: sdpOffer,
      });
      const text = await resp.text();
      log('raw webrtc: answer response meta', { url, status: resp.status, ct: resp.headers.get('content-type') });
      if (!resp.ok) {
        log('raw webrtc: answer error body', text);
        throw new Error(`Realtime SDP exchange failed (${resp.status})`);
      }
      if (!text.startsWith('v=')) {
        log('raw webrtc: non-SDP answer body', text);
        throw new Error('Realtime answered with non-SDP payload');
      }
      return text;
    };
    const mp = encodeURIComponent(model);
    const urlA = `https://api.openai.com/v1/realtime?model=${mp}`;
    const urlB = `https://api.openai.com/v1/realtime/sdp?model=${mp}`;
    let answer: string;
    try { answer = await doPost(urlA); } catch (e) { log('raw webrtc: fallback due to error', { name: (e as any)?.name, message: (e as any)?.message }); answer = await doPost(urlB); }
    log('raw webrtc: received SDP answer', answer.slice(0, 80) + '...');
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });
    log('raw webrtc: setRemoteDescription ok');
    return pc;
  }

  const start = useCallback(async () => {
    try {
      setStatus('connecting');
      log('POST /api/realtime/sessions');
      const r = await fetch(`/api/realtime/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      log('ephemeral session response', data);
      const token = data?.client_secret?.value || data?.client_secret || data?.apiKey;
      if (!token) throw new Error('Ephemeral token missing from /api/realtime/sessions response');
      const agent = new RealtimeAgent({
        name: 'Dexter Voice',
        instructions: 'Be concise and helpful. Use conversational tone.'
      });
      const session = new RealtimeSession(agent, {
        transport: 'webrtc',
        // Valid GA session config shape
        config: {
          instructions: 'Be concise and helpful. Use conversational tone.',
          outputModalities: ['audio', 'text'],
          audio: {
            input: { format: { type: 'audio/pcm', rate: 16000 } },
            output: { format: 'pcm16', voice: 'alloy', speed: 1 },
          },
        },
      });
      try {
        (session as any).on?.('error', (e: any) => log('session error', e));
        (session as any).on?.('close', () => log('session close'));
      } catch {}
      sessionRef.current = session;
      try {
        const mdl = (data?.model as string) || 'gpt-realtime';
        await session.connect({ apiKey: token, model: mdl, url: `https://api.openai.com/v1/realtime?model=${encodeURIComponent(mdl)}` });
      } catch (e: any) {
        log('connect error (library)', { name: e?.name, message: e?.message, stack: e?.stack });
        // Fallback to raw WebRTC handshake for full visibility
        await connectRawWebRTC(token, (data?.model as string) || 'gpt-realtime');
      }
      try {
        const tools = (session as any)?.availableMcpTools || [];
        log('available MCP tools', tools);
      } catch {}
      setStatus('connected');
    } catch (e) {
      log('fatal error', e);
      setStatus('error');
    }
  }, []);

  const stop = useCallback(async () => {
    try { await (sessionRef.current as any)?.disconnect?.(); } catch {}
    sessionRef.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => { try { (sessionRef.current as any)?.disconnect?.(); } catch {} };
  }, []);

  return (
    <div>
      <h1>Voice (Realtime)</h1>
      <p>Status: {status}</p>
      {status !== 'connected' ? (
        <button onClick={start} style={{padding:'8px 12px'}}>Start Session</button>
      ) : (
        <button onClick={stop} style={{padding:'8px 12px'}}>End Session</button>
      )}
      <p style={{opacity:.8, marginTop:8}}>Connects to OpenAI Realtime via ephemeral key from dexter-api.</p>
      <div style={{marginTop:12}}>
        <div style={{fontSize:12, opacity:.8, marginBottom:4}}>Debug log</div>
        <textarea readOnly value={debug} style={{width:'100%', height:200, background:'#0b0c10', color:'#9fb2c8', border:'1px solid #2c3242', borderRadius:4, padding:8}} />
      </div>
    </div>
  );
}
