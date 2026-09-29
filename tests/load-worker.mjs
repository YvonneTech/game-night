// Loads the real GameRoom class from worker/index.ts in plain Node by stubbing
// the `cloudflare:workers` import and transpiling with the repo's TypeScript.
// Lets focused unit tests exercise server view/redaction logic with zero new deps.
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const CLOUDFLARE_IMPORT = 'import { DurableObject } from "cloudflare:workers";';
const DURABLE_STUB = `class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}`;

let cached = null;

export function loadGameRoom() {
  if (cached) return cached;
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = readFileSync(join(root, "worker", "index.ts"), "utf8");
  if (!source.includes(CLOUDFLARE_IMPORT)) {
    throw new Error("worker/index.ts no longer has the expected cloudflare import; update tests/load-worker.mjs");
  }
  const stubbed = source.replace(CLOUDFLARE_IMPORT, DURABLE_STUB);
  const { outputText } = ts.transpileModule(stubbed, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const dir = mkdtempSync(join(tmpdir(), "game-night-test-"));
  const file = join(dir, "worker.cjs");
  writeFileSync(file, outputText);
  const { GameRoom } = require(file);
  // Minimal ctx: no sockets, storage/alarm calls are no-ops. Enough for view
  // helpers and removePlayer (save/schedule/broadcast become harmless).
  const ctxStub = {
    getWebSockets: () => [],
    storage: {
      sql: { exec: () => ({ toArray: () => [] }) },
      deleteAlarm: async () => {},
      setAlarm: async () => {},
    },
  };
  const room = new GameRoom(ctxStub, {});
  cached = { GameRoom, room };
  return cached;
}
