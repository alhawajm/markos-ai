/* Encrypted Windows recovery copy. Secrets stay in the Railway service and Windows DPAPI.
 * Usage: node scripts/railway-database-backup.cjs backup <database-service>@ssh.railway.com
 *        node scripts/railway-database-backup.cjs restore <manifest.json> markos_restore_<name>
 * Restore always creates a NEW disposable database in the local MARKOS Docker PostgreSQL.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const root = path.resolve(__dirname, "..");
const docker = "docker";
const container = "markos-ai-postgres-1";
function dpapi(value, decrypt = false) {
  if (process.platform !== "win32") throw Error("This recovery copy requires Windows DPAPI for the current Windows account");
  const method = decrypt ? "Unprotect" : "Protect";
  const result = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${method}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`
    ],
    { input: value.toString("base64"), encoding: "utf8", windowsHide: true }
  );
  return Buffer.from(result.trim(), "base64");
}
function completion(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(Error(`Backup/restore process failed (${code}); no database credentials were logged`))));
  });
}
async function backup(target) {
  if (!/^[a-f0-9-]{36}@ssh\.railway\.com$/.test(target || "")) throw Error("Pass the Railway DATABASE service SSH target");
  const folder = path.join(root, "var", "backups");
  fs.mkdirSync(folder, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.join(folder, `railway-${id}.dump.enc`);
  const key = crypto.randomBytes(32),
    iv = crypto.randomBytes(12),
    wrappedKey = dpapi(key).toString("base64");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ssh = spawn(
    "C:/Windows/System32/OpenSSH/ssh.exe",
    [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${path.join(process.env.USERPROFILE, ".ssh/markos_railway_known_hosts")}`,
      "-i",
      path.join(process.env.USERPROFILE, ".ssh/markos_railway_ed25519"),
      target,
      "sh -c 'exec pg_dump --format=custom --no-owner --no-privileges \"$DATABASE_URL\"'"
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
  );
  const done = completion(ssh);
  try {
    await Promise.all([pipeline(ssh.stdout, cipher, fs.createWriteStream(output, { flags: "wx" })), done]);
    const manifest = {
      format: "markos-pg-dump-aes256gcm-dpapi-v1",
      createdAt: new Date().toISOString(),
      sourceService: target.split("@")[0],
      file: path.basename(output),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      wrappedKey,
      bytes: fs.statSync(output).size
    };
    const file = output + ".json";
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ encryptedBackup: file, bytes: manifest.bytes }));
  } catch (e) {
    ssh.kill();
    throw e;
  } finally {
    key.fill(0);
  }
}
async function restore(manifestFile, database) {
  if (!/^markos_restore_[a-z0-9_]+$/.test(database || "")) throw Error("Only a NEW disposable markos_restore_* database is permitted");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.format !== "markos-pg-dump-aes256gcm-dpapi-v1" || path.basename(manifest.file) !== manifest.file) throw Error("Invalid backup manifest");
  const key = dpapi(Buffer.from(manifest.wrappedKey, "base64"), true);
  const ciphertext = path.join(path.dirname(path.resolve(manifestFile)), manifest.file);
  // Authenticate the complete backup BEFORE creating or restoring a database. No plaintext disk copy.
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(manifest.iv, "base64"));
  decipher.setAuthTag(Buffer.from(manifest.tag, "base64"));
  let dump;
  try {
    dump = Buffer.concat([decipher.update(fs.readFileSync(ciphertext)), decipher.final()]);
  } finally {
    key.fill(0);
  }
  execFileSync(docker, ["exec", container, "createdb", "-U", "markos", "--template=template0", database], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"]
  });
  const child = spawn(docker, ["exec", "-i", container, "pg_restore", "-U", "markos", "-d", database, "--no-owner", "--no-privileges", "--exit-on-error"], {
    windowsHide: true,
    stdio: ["pipe", "ignore", "ignore"]
  });
  const done = completion(child);
  child.stdin.on("error", () => {});
  child.stdin.end(dump);
  await done;
  dump.fill(0);
  const sql =
    "SELECT json_build_object('users',(SELECT count(*) FROM users),'workspaces',(SELECT count(*) FROM workspaces),'migrations',(SELECT count(*) FROM _prisma_migrations),'content',(SELECT count(*) FROM content_items),'media',(SELECT count(*) FROM media_assets),'extensions',(SELECT json_agg(extname ORDER BY extname) FROM pg_extension));";
  const counts = JSON.parse(
    execFileSync(docker, ["exec", container, "psql", "-U", "markos", "-d", database, "-Atc", sql], { encoding: "utf8", windowsHide: true })
  );
  const proof = { restoredAt: new Date().toISOString(), database, backup: path.basename(manifestFile), counts };
  fs.writeFileSync(path.resolve(manifestFile) + ".restore-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
}
module.exports = { dpapi };
if (require.main === module)
  (async () => {
    if (process.argv[2] === "backup") await backup(process.argv[3]);
    else if (process.argv[2] === "restore") await restore(process.argv[3], process.argv[4]);
    else throw Error("Choose backup or restore");
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
