'use client';

import { useEffect, useRef, useState } from 'react';
import Guacamole from 'guacamole-common-js';

export default function KaliDesktop() {
  const displayRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting...');
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let client: Guacamole.Client | null = null;
    let keyboard: Guacamole.Keyboard | null = null;
    let cancelled = false;

    async function connect() {
      try {
        const res = await fetch('/api/guac-token');
        const { token } = await res.json();
        if (cancelled) return;

        const baseWsUrl = `${(process.env.NEXT_PUBLIC_GUAC_WS_URL || '').replace(/\/+$/, '')}/`;
        const tunnel = new Guacamole.WebSocketTunnel(baseWsUrl);

        tunnel.onerror = (err) => {
          const msg = `Tunnel Error (code=${err?.code}): ${err?.message || 'unknown'}`;
          console.error('[Guacamole Tunnel Error]', msg);
          setLastError(msg);
          setStatus(msg);
        };

        tunnel.onstatechange = (state) => {
          // 0: CONNECTING, 1: OPEN, 2: CLOSED, 3: UNSTABLE
          if (state === 2) {
            setStatus((prev) => (prev.startsWith('Tunnel Error') || prev.startsWith('Error') ? prev : 'Disconnected'));
          }
        };

        client = new Guacamole.Client(tunnel);

        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(client.getDisplay().getElement());
        }

        client.onstatechange = (state) => {
          const states = ['Idle', 'Connecting...', 'Waiting...', 'Connected', 'Disconnecting...', 'Disconnected'];
          setStatus(states[state] || 'Unknown');
        };

        client.onerror = (err) => {
          const msg = `Client Error (code=${err?.code}): ${err?.message || 'unknown'}`;
          console.error('[Guacamole Client Error]', msg);
          setLastError(msg);
          setStatus(msg);
        };

        const mouse = new Guacamole.Mouse(client.getDisplay().getElement());
        mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState) => {
          client?.sendMouseState(mouseState);
        };

        keyboard = new Guacamole.Keyboard(document);
        keyboard.onkeydown = (keysym) => client?.sendKeyEvent(1, keysym);
        keyboard.onkeyup = (keysym) => client?.sendKeyEvent(0, keysym);

        client.connect(`token=${encodeURIComponent(token)}`);
      } catch (err) {
        if (!cancelled) {
          setStatus('Failed to fetch token');
          console.error(err);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
      client?.disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-black text-white">
      <div className="px-4 py-2 text-xs font-mono border-b border-neutral-800 flex justify-between gap-4">
        <span>KALI-LAB-01 // RDP</span>
        <span>
          Status: {status}
          {lastError ? ` | ${lastError}` : ''}
        </span>
      </div>
      <div
        ref={displayRef}
        className="relative z-0 isolate flex-1 overflow-hidden flex items-center justify-center cursor-none"
      />
    </div>
  );
}
