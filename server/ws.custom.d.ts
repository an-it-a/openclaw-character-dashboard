declare module "ws" {
  import { IncomingMessage } from "node:http";
  import { Duplex } from "node:stream";

  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export class WebSocket {
    static readonly CONNECTING: number;
    static readonly OPEN: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;

    readonly readyState: number;

    constructor(
      url: string,
      options?: {
        headers?: Record<string, string>;
      },
    );

    send(data: string, cb?: (error?: Error) => void): void;
    close(): void;
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean; port?: number });
    on(event: "connection", listener: (ws: WebSocket, request: IncomingMessage) => void): this;
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket) => void
    ): void;
    emit(event: string, ...args: any[]): void;
  }
}
