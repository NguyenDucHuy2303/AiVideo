/**
 * HTTPS for the phone page: an iPhone saves videos straight into Photos (the share sheet's
 * "Save Video") only from a secure page. The studio is its own certificate authority:
 *
 *   studio/secrets/tls/ca.key, ca.crt   made once, installed on the phone once (/ca explains how)
 *   studio/secrets/tls/server.key, .crt  for this computer's addresses, made again when the
 *                                        home address changes or the year runs out
 *
 * The authority is limited by name constraints to home-network addresses (192.168.x.x, 10.x,
 * 172.16–31.x, 127.x) and "localhost": installed on a phone, it cannot vouch for any real site.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";
import { SECRETS } from "./publish.ts";

export const TLS_DIR = path.join(SECRETS, "tls");
const f = (name: string) => path.join(TLS_DIR, name);
export const CA_NAME = "Wata Studio (may nha)";

const CA_EXT = [
  "basicConstraints = critical, CA:TRUE, pathlen:0",
  "keyUsage = critical, keyCertSign, cRLSign",
  "subjectKeyIdentifier = hash",
  "nameConstraints = critical, permitted;IP:192.168.0.0/255.255.0.0, permitted;IP:10.0.0.0/255.0.0.0, permitted;IP:172.16.0.0/255.240.0.0, permitted;IP:127.0.0.0/255.0.0.0, permitted;DNS:localhost",
].join("\n");

const openssl = (args: string[]) => run("openssl", args, { timeoutMs: 60_000 });

/** The addresses in the server certificate (IP and DNS names). */
export async function certNames(crt = f("server.crt")): Promise<{ ips: string[]; notAfter: Date } | undefined> {
  if (!(await exists(crt))) return undefined;
  const { stdout } = await openssl(["x509", "-in", crt, "-noout", "-ext", "subjectAltName", "-enddate"]);
  return { ips: [...stdout.matchAll(/IP Address:([\d.]+)/g)].map((m) => m[1]!), notAfter: new Date(/notAfter=(.+)/.exec(stdout)![1]!) };
}

/** Does the server certificate need making (again) for this address? */
export function stale(names: { ips: string[]; notAfter: Date } | undefined, lan: string | undefined, now = new Date()): boolean {
  if (!names) return true;
  if (lan && !names.ips.includes(lan)) return true;
  return names.notAfter.getTime() - now.getTime() < 30 * 86400_000;
}

/** The authority (once) and a server certificate for 127.0.0.1 and the home address. */
export async function ensureCerts(lan: string | undefined): Promise<{ key: Buffer; cert: Buffer; made: boolean }> {
  await fs.mkdir(TLS_DIR, { recursive: true, mode: 0o700 });
  if (!(await exists(f("ca.key"))) || !(await exists(f("ca.crt")))) {
    await fs.writeFile(f("ca.ext"), CA_EXT);
    await openssl(["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", f("ca.key")]);
    await fs.chmod(f("ca.key"), 0o600);
    await openssl(["req", "-x509", "-new", "-key", f("ca.key"), "-sha256", "-days", "3650", "-subj", `/CN=${CA_NAME}/O=Wata Studio`, "-extensions", "v3_ca", "-config", await caConfig(), "-out", f("ca.crt")]);
    await fs.rm(f("server.crt"), { force: true });
  }
  let made = false;
  if (stale(await certNames(), lan)) {
    const alt = ["IP:127.0.0.1", "DNS:localhost", ...(lan ? [`IP:${lan}`] : [])].join(",");
    await fs.writeFile(f("server.ext"), [
      "basicConstraints = critical, CA:FALSE",
      "keyUsage = critical, digitalSignature, keyEncipherment",
      "extendedKeyUsage = serverAuth",
      `subjectAltName = ${alt}`,
    ].join("\n"));
    await openssl(["genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", f("server.key")]);
    await fs.chmod(f("server.key"), 0o600);
    await openssl(["req", "-new", "-key", f("server.key"), "-subj", `/CN=${lan ?? "localhost"}`, "-out", f("server.csr")]);
    // 397 days: within what Apple accepts for a server certificate.
    await openssl(["x509", "-req", "-in", f("server.csr"), "-CA", f("ca.crt"), "-CAkey", f("ca.key"), "-CAcreateserial", "-sha256", "-days", "397", "-extfile", f("server.ext"), "-out", f("server.crt")]);
    made = true;
  }
  return { key: await fs.readFile(f("server.key")), cert: Buffer.concat([await fs.readFile(f("server.crt")), await fs.readFile(f("ca.crt"))]), made };
}

/** openssl req needs a config with the CA's extensions section. */
async function caConfig(): Promise<string> {
  const file = f("ca.cnf");
  await fs.writeFile(file, `[req]\ndistinguished_name = dn\n[dn]\n[v3_ca]\n${CA_EXT}\n`);
  return file;
}

export const caCert = () => fs.readFile(f("ca.crt"));
