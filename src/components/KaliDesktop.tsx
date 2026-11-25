'use client';

import { useEffect, useRef, useState } from 'react';
import Guacamole from 'guacamole-common-js';

export default function KaliDesktop() {
  const rootRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Connecting...');
  const [lastError, setLastError] = useState<string | null>(null);
  const [vmLabel, setVmLabel] = useState('KALI-LAB-01');
  const [reconnectTick, setReconnectTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    let client: Guacamole.Client | null = null;
    let keyboard: Guacamole.Keyboard | null = null;
    let cancelled = false;

    async function connect() {
      try {
        setLastError(null);
        setStatus('Connecting...');
        const params = new URLSearchParams(window.location.search);
        const vmParam = params.get('vm') || '';
        const rect = displayRef.current?.getBoundingClientRect();
        const width = Math.max(640, Math.min(1920, Math.round(rect?.width || window.innerWidth)));
        const height = Math.max(480, Math.min(1080, Math.round(rect?.height || window.innerHeight - 40)));

        const query = new URLSearchParams({
          protocol: 'rdp',
          width: String(width),
          height: String(height),
        });
        if (vmParam) query.set('vm', vmParam);

        const res = await fetch(`/api/guac-token?${query.toString()}`);
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        if (!res.ok || !data.token) {
          throw new Error(data.error || 'Failed to fetch token');
        }
        if (cancelled) return;

        if (data.vm) setVmLabel(String(data.vm).toUpperCase());

        const baseWsUrl = `${(process.env.NEXT_PUBLIC_GUAC_WS_URL || '').replace(/\/+$/, '')}/`;
        const tunnel = new Guacamole.WebSocketTunnel(baseWsUrl);

        tunnel.onerror = (err) => {
          const msg = `Tunnel Error (code=${err?.code}): ${err?.message || 'unknown'}`;
          console.error('[Guacamole Tunnel Error]', msg);
          setLastError(msg);
          setStatus(msg);
        };

        tunnel.onstatechange = (state) => {
          if (state === 2) {
            setStatus((prev) =>
              prev.startsWith('Tunnel Error') || prev.startsWith('Client Error')
                ? prev
                : 'Disconnected'
            );
          }
        };

        client = new Guacamole.Client(tunnel);
        const display = client.getDisplay();

        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(display.getElement());
        }

        const fitDisplay = () => {
          const container = displayRef.current;
          if (!container) return;
          const dw = display.getWidth();
          const dh = display.getHeight();
          if (dw > 0 && dh > 0 && container.clientWidth > 0 && container.clientHeight > 0) {
            const scale = Math.min(container.clientWidth / dw, container.clientHeight / dh);
            display.scale(scale);
          }
        };

        let sendSizeTimer: ReturnType<typeof setTimeout> | null = null;
        const sendDisplaySize = () => {
          const container = displayRef.current;
          if (!container || !client) return;
          const cw = Math.max(640, Math.min(1920, Math.round(container.clientWidth)));
          const ch = Math.max(480, Math.min(1080, Math.round(container.clientHeight)));
          if (cw > 0 && ch > 0) {
            try { client.sendSize(cw, ch); } catch { /* ignore */ }
          }
        };
        const scheduleResize = () => {
          fitDisplay();
          if (sendSizeTimer) clearTimeout(sendSizeTimer);
          sendSizeTimer = setTimeout(() => {
            sendSizeTimer = null;
            sendDisplaySize();
          }, 250);
        };

        (display as unknown as { onresize?: (w: number, h: number) => void }).onresize = () => {
          fitDisplay();
        };

        client.onstatechange = (state) => {
          const states = ['Idle', 'Connecting...', 'Waiting...', 'Connected', 'Disconnecting...', 'Disconnected'];
          setStatus(states[state] || 'Unknown');
          if (state === 3) {
            setTimeout(() => {
              fitDisplay();
              sendDisplaySize();
            }, 200);
          }
        };

        client.onerror = (err) => {
          const msg = `Client Error (code=${err?.code}): ${err?.message || 'unknown'}`;
          console.error('[Guacamole Client Error]', msg);
          setLastError(msg);
          setStatus(msg);
        };

        const mouse = new Guacamole.Mouse(display.getElement());
        mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState) => {
          const scale = display.getScale() || 1;
          const scaledState = new Guacamole.Mouse.State(
            mouseState.x / scale,
            mouseState.y / scale,
            mouseState.left,
            mouseState.middle,
            mouseState.right,
            mouseState.up,
            mouseState.down
          );
          client?.sendMouseState(scaledState);
        };

        keyboard = new Guacamole.Keyboard(document);
        keyboard.onkeydown = (keysym) => client?.sendKeyEvent(1, keysym);
        keyboard.onkeyup = (keysym) => client?.sendKeyEvent(0, keysym);

        window.addEventListener('resize', scheduleResize);
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && displayRef.current) {
          ro = new ResizeObserver(() => scheduleResize());
          ro.observe(displayRef.current);
        }
        client.connect(`token=${encodeURIComponent(data.token)}`);

        return () => {
          window.removeEventListener('resize', scheduleResize);
          ro?.disconnect();
          if (sendSizeTimer) clearTimeout(sendSizeTimer);
        };
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to fetch token';
          setLastError(msg);
          setStatus(msg);
          console.error(err);
        }
      }
    }

    let cleanupResize: (() => void) | undefined;
    connect().then((fn) => {
      cleanupResize = fn;
    });

    return () => {
      cancelled = true;
      cleanupResize?.();
      if (keyboard) {
        keyboard.onkeydown = null;
        keyboard.onkeyup = null;
      }
      client?.disconnect();
    };
  }, [reconnectTick]);

  return (
    <div ref={rootRef} className="flex flex-col w-full h-screen bg-black text-white">
      <div className="px-4 py-2 text-xs font-mono border-b border-line flex items-center justify-between gap-4 bg-surface text-fg">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-fg cursor-pointer"
          >
            Dashboard
          </a>
          <span>{vmLabel} // RDP</span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Status: {status}
            {lastError && !status.includes(lastError) ? ` | ${lastError}` : ''}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-fg cursor-pointer"
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button
            type="button"
            onClick={() => setReconnectTick((n) => n + 1)}
            className="px-2 py-0.5 rounded border border-line hover:bg-raised text-fg cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      </div>
      <div
        ref={displayRef}
        className="relative z-0 isolate flex-1 overflow-hidden flex items-center justify-center cursor-none"
      />
    </div>
  );
}
