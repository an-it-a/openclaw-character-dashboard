import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { lookup as mimeLookup } from "mime-types";
import { WebSocket } from "ws";
import type { RawData } from "ws";

type GatewayConfig = {
  httpUrl: string;
  wsUrl: string;
  token: string;
};

type GatewayAgentsPayload = {
  agents?: Array<{ id?: string }>;
};

type GatewaySnapshot = {
  agents: unknown;
  sessions: unknown;
  presence: unknown;
  identities: Record<string, unknown>;
  source: string;
  fetchedAt: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type GatewayEventMessage = {
  type: "event";
  event: string;
};

type GatewayResponseMessage = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: any;
  error?: {
    message?: string;
  };
};

type GatewayMessage = GatewayEventMessage | GatewayResponseMessage;

loadServerEnv();

const app = express();
const DEFAULT_PORT = Number(process.env["API_PORT"] ?? 3001);
const OPENCLAW_HOME = process.env["OPENCLAW_HOME"]
  ? resolveConfiguredPath(process.env["OPENCLAW_HOME"])
  : path.join(
      process.env["HOME"] ?? process.env["USERPROFILE"] ?? process.cwd(),
      ".openclaw",
    );

// The shared files root — override with SHARED_ROOT env var, or falls back to
// <OPENCLAW_HOME>/shared.
const SHARED_ROOT = process.env["SHARED_ROOT"]
  ? resolveConfiguredPath(process.env["SHARED_ROOT"])
  : path.join(OPENCLAW_HOME, "shared");

const gatewayConfigPromise = readGatewayConfig();

app.use(cors({ origin: /localhost/ }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Static Files (Production)
// ---------------------------------------------------------------------------

const DIST_PATH = path.join(process.cwd(), "dist");
if (existsSync(DIST_PATH)) {
  console.warn(`[resource-wall server] Serving static files from: ${DIST_PATH}`);
  app.use(express.static(DIST_PATH));
}

// ---------------------------------------------------------------------------
// GET /api/openclaw/snapshot
// Proxies a live OpenClaw gateway snapshot over HTTP for the frontend.
// ---------------------------------------------------------------------------

app.get("/api/openclaw/snapshot", async (_req: Request, res: Response): Promise<void> => {
  try {
    const payload = await fetchGatewaySnapshot(gatewayConfigPromise);
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/files?path=<relative>
// Lists directory entries under SHARED_ROOT/<path>
// ---------------------------------------------------------------------------

app.get("/api/files", async (req: Request, res: Response): Promise<void> => {
  const rel = sanitiseRelPath(req.query["path"]);
  const abs = path.join(SHARED_ROOT, rel);

  try {
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: "Path is not a directory" });
      return;
    }

    const names = await fs.readdir(abs);
    const entries = await Promise.all(
      names.map(async (name) => {
        const childStat = await fs.stat(path.join(abs, name)).catch(() => null);
        return {
          name,
          type: childStat?.isDirectory() ? "dir" : "file",
        };
      }),
    );

    res.json({ path: rel, entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: `Path not found: ${rel}` });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------------------
// GET /api/file?path=<relative>
// Streams a file from SHARED_ROOT/<path>
// ---------------------------------------------------------------------------

app.get("/api/file", async (req: Request, res: Response): Promise<void> => {
  const rel = sanitiseRelPath(req.query["path"]);
  const abs = path.join(SHARED_ROOT, rel);

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      res.status(400).json({ error: "Path is not a file" });
      return;
    }

    const mimeType = mimeLookup(abs) || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-cache");

    createReadStream(abs).pipe(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: `File not found: ${rel}` });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------------------
// SPA Fallback (Production)
// ---------------------------------------------------------------------------

if (existsSync(DIST_PATH)) {
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(DIST_PATH, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

startServer(DEFAULT_PORT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitise the `path` query param to a safe relative path.
 * Strips leading slashes and resolves ".." traversal.
 */
function sanitiseRelPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Normalise and strip any traversal outside the root
  const normalised = path.normalize(raw).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalised;
}

function startServer(port: number): void {
  const gatewayHost = process.env["GATEWAY_HOST"] ?? "127.0.0.1";
  app
    .listen(port, "0.0.0.0", () => {
      console.warn(
        `[resource-wall server] Listening on http://0.0.0.0:${port}`,
      );
      console.warn(`[resource-wall server] CWD: ${process.cwd()}`);
      console.warn(`[resource-wall server] Serving files from: ${SHARED_ROOT}`);
      console.warn(`[resource-wall server] Targeting OpenClaw Gateway at: ${gatewayHost}`);
      console.warn(`[resource-wall server] OpenClaw Home is set to: ${OPENCLAW_HOME}`);

      void gatewayConfigPromise.then((config) => {
        const monitor = new GatewayEventMonitor(config);
        monitor.start();
      });
    })
    .on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        throw new Error(
          `[resource-wall server] Port ${port} is already in use. ` +
            `Update API_PORT/VITE_API_PORT in your env config or stop the process using that port.`,
        );
      }

      throw error;
    });
}

class GatewayEventMonitor {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private shouldReconnect = true;
  private runRoles = new Map<string, string>();

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  start() {
    if (!this.shouldReconnect) return;
    console.log(`[monitor] Connecting to ${this.config.wsUrl} (token length: ${this.config.token.length})...`);
    this.ws = new WebSocket(this.config.wsUrl, {
      headers: { Origin: this.config.httpUrl },
    });

    this.ws.on("message", (data: RawData) => {
      const rawString = String(data);
      const message = parseGatewayMessage(data);
      if (!message) return;

      if (message.type === "event") {
        if (message.event === "connect.challenge") {
          this.ws?.send(
            JSON.stringify({
              type: "req",
              id: "connect",
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "openclaw-control-ui",
                  version: "openclaw-character-dashboard-monitor",
                  platform: "node",
                  mode: "webchat",
                  instanceId: "openclaw-character-dashboard-monitor",
                },
                role: "operator",
                scopes: ["operator.read"],
                caps: ["tool-events"],
                auth: this.config.token ? { token: this.config.token } : {},
                userAgent: "node-monitor",
                locale: "en",
              },
            }),
          );
          return;
        }

        const raw = JSON.parse(rawString);
        const payload = raw.payload;
        if (!payload) return;

        if (message.event === "chat") {
          const runId = payload.runId || "unknown";
          const messageData = payload.message || {};
          
          // Capture role if present, otherwise fallback to cached role for this run
          let role = (typeof messageData.role === "string" ? messageData.role : "").toLowerCase();
          if (role) {
            this.runRoles.set(runId, role);
          } else {
            role = this.runRoles.get(runId) || "assistant";
          }

          const content = typeof messageData.content === "string" 
            ? messageData.content 
            : Array.isArray(messageData.content)
              ? messageData.content.map((p: any) => p.text || "").join("")
              : typeof messageData.text === "string"
                ? messageData.text
                : "";

          if (content) {
            console.log(`[AGENT MESSAGE] [${runId}] ${role.toUpperCase()}: ${content}`);
          }

          // Cleanup role cache on final/error states
          if (payload.state === "final" || payload.state === "error" || payload.state === "aborted") {
            this.runRoles.delete(runId);
          }
        } else if (message.event === "agent") {
          const stream = payload.stream || "unknown";
          const runId = payload.runId || "none";
          if (payload.data && payload.data.chunk) {
             console.log(`[AGENT STREAM] [${runId}] ${stream.toUpperCase()}: ${payload.data.chunk}`);
          } else if (payload.data && payload.data.phase) {
             console.log(`[AGENT LIFECYCLE] [${runId}] PHASE: ${payload.data.phase}`);
             if (payload.data.phase === "end" || payload.data.phase === "error") {
               this.runRoles.delete(runId);
             }
          }
        }
      } else if (message.type === "res" && message.id === "connect") {
        if (message.ok) {
          console.log(`[monitor] Successfully connected to gateway`);
        } else {
          console.error(`[monitor] Gateway connect failed: ${message.error?.message}`);
        }
      }
    });

    this.ws.on("close", () => {
      console.warn(`[monitor] WebSocket closed`);
      this.ws = null;
      if (this.shouldReconnect) {
        console.log(`[monitor] Reconnecting in 5s...`);
        setTimeout(() => this.start(), 5000);
      }
    });

    this.ws.on("error", (err) => {
      console.error(`[monitor] WebSocket error: ${err.message}`);
    });
  }

  stop() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}


function loadServerEnv(): void {
  const envDir = process.cwd();
  const loadedValues: Record<string, string> = {};

  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(envDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(loadedValues, parseEnvFile(readFileSync(filePath, "utf8")));
  }

  for (const [key, value] of Object.entries(loadedValues)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  if (
    process.env["API_PORT"] === undefined &&
    process.env["VITE_API_PORT"] !== undefined
  ) {
    process.env["API_PORT"] = process.env["VITE_API_PORT"];
  }
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function resolveConfiguredPath(rawPath: string): string {
  if (rawPath === "~") {
    return os.homedir();
  }

  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2));
  }

  return path.resolve(rawPath);
}

async function readGatewayConfig(): Promise<GatewayConfig> {
  const gatewayHost = process.env["GATEWAY_HOST"] ?? "127.0.0.1";
  const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } };
    };
    const port = parsed.gateway?.port ?? 18789;
    const token = parsed.gateway?.auth?.token ?? "";

    if (token) {
      console.log(`[gateway] Loaded auth token from ${configPath}`);
    } else {
      console.warn(`[gateway] No auth token found in ${configPath}`);
    }

    return {
      httpUrl: `http://${gatewayHost}:${port}`,
      wsUrl: `ws://${gatewayHost}:${port}`,
      token,
    };
  } catch (err) {
    const port = 18789;
    console.warn(`[gateway] Could not read config at ${configPath}, using defaults. Error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      httpUrl: `http://${gatewayHost}:${port}`,
      wsUrl: `ws://${gatewayHost}:${port}`,
      token: "",
    };
  }
}

async function fetchGatewaySnapshot(
  gatewayConfigPromise: GatewayConfig | Promise<GatewayConfig>,
): Promise<GatewaySnapshot> {
  const gatewayConfig = await gatewayConfigPromise;

  console.log(`[gateway] Attempting connection to ${gatewayConfig.wsUrl}...`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(gatewayConfig.wsUrl, {
      headers: { Origin: gatewayConfig.httpUrl },
    });

    let requestSeq = 1;
    let settled = false;
    const pending = new Map<string, PendingRequest>();

    const rejectAllPending = (error: Error): void => {
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
    };

    const finish = (
      result:
        | { ok: true; value: GatewaySnapshot }
        | { ok: false; error: Error },
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }

      if (!result.ok) {
        const error = (result as { error: Error }).error;
        console.error(`[gateway] Connection failed: ${error.message}`);
        rejectAllPending(error);
        reject(error);
      } else {
        console.log(`[gateway] Successfully fetched snapshot from ${gatewayConfig.httpUrl}`);
        resolve(result.value);
      }
    };

    const request = <T>(
      method: string,
      params: Record<string, unknown>,
    ): Promise<T> =>
      new Promise<T>((resolveRequest, rejectRequest) => {
        const id = String(requestSeq++);
        pending.set(id, {
          resolve: resolveRequest as (value: unknown) => void,
          reject: rejectRequest,
        });

        ws.send(
          JSON.stringify({ type: "req", id, method, params }),
          (error: Error | undefined) => {
            if (!error) {
              return;
            }

            pending.delete(id);
            rejectRequest(
              error instanceof Error ? error : new Error(String(error)),
            );
          },
        );
      });

    const timeout = setTimeout(() => {
      finish({ ok: false, error: new Error("Gateway snapshot timeout") });
    }, 15_000);

    ws.on("message", async (data: RawData) => {
      const message = parseGatewayMessage(data);
      if (!message) {
        return;
      }

      if (message.type === "event" && message.event === "connect.challenge") {
        ws.send(
          JSON.stringify({
            type: "req",
            id: "connect",
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "openclaw-control-ui",
                version: "openclaw-character-dashboard-dev-server",
                platform: "node",
                mode: "webchat",
                instanceId: "openclaw-character-dashboard-dev-server",
              },
              role: "operator",
              scopes: ["operator.read"],
              caps: ["tool-events"],
              auth: gatewayConfig.token ? { token: gatewayConfig.token } : {},
              userAgent: "vite-dev-server",
              locale: "en",
            },
          }),
        );
        return;
      }

      if (message.type !== "res") {
        return;
      }

      if (message.id === "connect") {
        if (!message.ok) {
          finish({
            ok: false,
            error: new Error(
              message.error?.message ?? "Gateway connect failed",
            ),
          });
          return;
        }

        try {
          const [agents, sessions, presence] = await Promise.all([
            request<unknown>("agents.list", {}),
            request<unknown>("sessions.list", {
              includeGlobal: true,
              includeUnknown: true,
              limit: 100,
            }),
            request<unknown>("system-presence", {}).catch(() => []),
          ]);

          const agentIds = ((agents as GatewayAgentsPayload).agents ?? [])
            .map((agent) => agent.id)
            .filter(
              (agentId): agentId is string => typeof agentId === "string",
            );

          const identityEntries = await Promise.all(
            agentIds.map(async (agentId) => {
              try {
                const identity = await request<unknown>("agent.identity.get", {
                  agentId,
                });
                return [agentId, identity] as const;
              } catch (error) {
                return [
                  agentId,
                  {
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                ] as const;
              }
            }),
          );

          finish({
            ok: true,
            value: {
              agents,
              sessions,
              presence,
              identities: Object.fromEntries(identityEntries),
              source: gatewayConfig.httpUrl,
              fetchedAt: Date.now(),
            },
          });
        } catch (error) {
          finish({
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
        return;
      }

      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }

      pending.delete(message.id);
      if (message.ok) {
        entry.resolve(message.payload);
      } else {
        entry.reject(
          new Error(message.error?.message ?? "Gateway request failed"),
        );
      }
    });

    ws.on("error", (err: Error) => {
      finish({ ok: false, error: err });
    });

    ws.on("close", () => {
      if (!settled) {
        finish({ ok: false, error: new Error("Gateway websocket closed") });
      }
    });
  });
}

function parseGatewayMessage(raw: unknown): GatewayMessage | null {
  try {
    const parsed = JSON.parse(String(raw)) as Partial<GatewayMessage>;

    if (parsed.type === "event" && typeof parsed.event === "string") {
      return { type: "event", event: parsed.event };
    }

    if (
      parsed.type === "res" &&
      typeof parsed.id === "string" &&
      typeof parsed.ok === "boolean"
    ) {
      return {
        type: "res",
        id: parsed.id,
        ok: parsed.ok,
        payload: parsed.payload,
        error:
          parsed.error && typeof parsed.error === "object"
            ? {
                message:
                  typeof parsed.error.message === "string"
                    ? parsed.error.message
                    : undefined,
              }
            : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}
