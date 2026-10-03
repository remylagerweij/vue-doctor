// Preloaded with `node --import` (via NODE_OPTIONS, so child processes are guarded too).
// Records and blocks every outbound network attempt: sockets (covers http, https, tls and the
// built-in fetch), DNS lookups and fetch itself.
import dns from "node:dns";
import fs from "node:fs";
import net from "node:net";

const logFile = process.env.NETWORK_GUARD_LOG;

const block = (kind, target) => {
  if (logFile) fs.appendFileSync(logFile, `${process.pid} ${kind} ${target}\n`);
  throw new Error(`network access blocked by test guard: ${kind} ${target}`);
};

const describeTarget = (args) => {
  const [first, second] = args;
  if (first && typeof first === "object") return `${first.host ?? first.path ?? "?"}:${first.port ?? ""}`;
  return `${second ?? ""}:${first ?? ""}`;
};

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = args[0];
  // Local IPC (named pipes / unix sockets, e.g. used by child_process stdio) is not network.
  if (options && typeof options === "object" && typeof options.path === "string") {
    return originalConnect.apply(this, args);
  }
  return block("socket", describeTarget(args));
};

dns.lookup = (hostname) => block("dns", hostname);
dns.promises.lookup = async (hostname) => block("dns", hostname);
globalThis.fetch = async (input) => block("fetch", String(input));
