import express from "express";
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
  payload?: unknown;
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
// GET /api/openclaw/snapshot
// Proxies a live OpenClaw gateway snapshot over HTTP for the frontend.
// ---------------------------------------------------------------------------

app.get("/api/openclaw/snapshot", async (_req, res): Promise<void> => {
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

app.get("/api/files", async (req, res): Promise<void> => {
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

app.get("/api/file", async (req, res): Promise<void> => {
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
  return normalised === "." ? "" : normalised;
}

function startServer(port: number): void {
  app
    .listen(port, () => {
      console.warn(
        `[resource-wall server] Listening on http://localhost:${port}`,
      );
      console.warn(`[resource-wall server] Serving files from: ${SHARED_ROOT}`);
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
  try {
    const configPath = path.join(OPENCLAW_HOME, "openclaw.json");
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } };
    };
    const port = parsed.gateway?.port ?? 18789;
    const token = parsed.gateway?.auth?.token ?? "";

    return {
      httpUrl: `http://127.0.0.1:${port}`,
      wsUrl: `ws://127.0.0.1:${port}`,
      token,
    };
  } catch {
    return {
      httpUrl: "http://127.0.0.1:18789",
      wsUrl: "ws://127.0.0.1:18789",
      token: "",
    };
  }
}

async function fetchGatewaySnapshot(
  gatewayConfigPromise: GatewayConfig | Promise<GatewayConfig>,
): Promise<GatewaySnapshot> {
  const gatewayConfig = await gatewayConfigPromise;

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

      if (result.ok) {
        resolve(result.value);
      } else {
        rejectAllPending(result.error);
        reject(result.error);
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

    ws.on("error", () => {
      finish({ ok: false, error: new Error("Gateway websocket error") });
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
