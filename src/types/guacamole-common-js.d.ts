declare module 'guacamole-common-js' {
  namespace Guacamole {
    class Tunnel {
      connect(data?: string): void;
      disconnect(): void;
      sendMessage(...elements: unknown[]): void;
      isConnected(): boolean;
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
    }

    class WebSocketTunnel extends Tunnel {
      constructor(tunnelURL: string);
    }

    class Status {
      code: number;
      message?: string;
      constructor(code: number, message?: string);
      isError(): boolean;
    }

    class Display {
      getElement(): HTMLElement;
      getWidth(): number;
      getHeight(): number;
      scale(scale: number): void;
      getScale(): number;
    }

    class Client {
      constructor(tunnel: Tunnel);
      getDisplay(): Display;
      connect(data?: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: number, keysym: number): void;
      sendMouseState(mouseState: Mouse.State, applyDisplayScale?: boolean): void;
      sendSize(width: number, height: number): void;
      onstatechange: ((state: number) => void) | null;
      onerror: ((status: Status) => void) | null;
    }

    class Mouse {
      constructor(element: HTMLElement);
      onmousedown: ((state: Mouse.State) => void) | null;
      onmouseup: ((state: Mouse.State) => void) | null;
      onmousemove: ((state: Mouse.State) => void) | null;
      onmouseout: (() => void) | null;
    }

    namespace Mouse {
      class State {
        x: number;
        y: number;
        left: boolean;
        middle: boolean;
        right: boolean;
        up: boolean;
        down: boolean;
        constructor(
          x?: number,
          y?: number,
          left?: boolean,
          middle?: boolean,
          right?: boolean,
          up?: boolean,
          down?: boolean
        );
      }
    }

    class Keyboard {
      constructor(element?: Document | HTMLElement | Window);
      onkeydown: ((keysym: number) => boolean | void) | null;
      onkeyup: ((keysym: number) => void) | null;
      reset(): void;
    }
  }

  export default Guacamole;
}
