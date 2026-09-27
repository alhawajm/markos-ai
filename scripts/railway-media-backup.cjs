// Back up active database-referenced media. Never writes or deletes remote objects.
// Usage: node scripts/railway-media-backup.cjs backup <API-service>@ssh.railway.com
//        node scripts/railway-media-backup.cjs restore <manifest.json> markos_media_restore_<name>
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { dpapi } = require("./railway-database-backup.cjs");
const root = path.resolve(__dirname, "..");
const program = `
const {createRequire}=await import('node:module');const require=createRequire('/app/apps/api/package.json');
const {PrismaClient}=require('@prisma/client');const {S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');const {createHash}=await import('node:crypto');const {once}=await import('node:events');
const db=new PrismaClient();const c=new S3Client({endpoint:process.env.AWS_ENDPOINT_URL,region:process.env.AWS_DEFAULT_REGION,forcePathStyle:process.env.AWS_S3_URL_STYLE==='path',credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID,secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY}});
const write=async value=>{if(!process.stdout.write(JSON.stringify(value)+'\\n'))await once(process.stdout,'drain');};
try{const workspaces=await db.workspace.findMany({where:{deletedAt:null},select:{id:true}});const rows=await db.mediaAsset.findMany({where:{deletedAt:null,workspaceId:{in:workspaces.map(w=>w.id)}},select:{id:true,workspaceId:true,s3Key:true,mimeType:true,filename:true,sizeBytes:true},orderBy:{id:'asc'}});
await write({kind:'markos-media-v1',count:rows.length});
for(const row of rows){if(!row.s3Key.startsWith('s3:')||!row.s3Key.includes(row.workspaceId))throw Error('MEDIA_SCOPE_MISMATCH');const object=await c.send(new GetObjectCommand({Bucket:process.env.AWS_S3_BUCKET_NAME,Key:row.s3Key.slice(3)}));const data=Buffer.from(await object.Body.transformToByteArray());if(data.length!==row.sizeBytes)throw Error('MEDIA_SIZE_MISMATCH');await write({...row,sha256:createHash('sha256').update(data).digest('hex'),data:data.toString('base64')});}
}catch{process.stderr.write('Media backup failed');process.exitCode=1;}finally{await db.$disconnect();c.destroy();}`;
async function backup(target) {
  if (!/^[a-f0-9-]{36}@ssh\.railway\.com$/.test(target || "")) throw Error("Pass the Railway API service SSH target");
  const folder = path.join(root, "var/backups");
  fs.mkdirSync(folder, { recursive: true });
  const output = path.join(folder, "media-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jsonl.enc");
  const key = crypto.randomBytes(32),
    iv = crypto.randomBytes(12),
    wrappedKey = dpapi(key).toString("base64"),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const child = spawn(
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
      "node --input-type=module"
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }
  );
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(Error("Remote media backup failed; encrypted partial file is not usable"))));
  });
  child.stdin.on("error", () => {});
  child.stdin.end(program);
  try {
    await Promise.all([pipeline(child.stdout, cipher, fs.createWriteStream(output, { flags: "wx" })), done]);
    const manifest = {
      format: "markos-media-aes256gcm-dpapi-v1",
      createdAt: new Date().toISOString(),
      file: path.basename(output),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      wrappedKey,
      bytes: fs.statSync(output).size
    };
    fs.writeFileSync(output + ".json", JSON.stringify(manifest, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ manifest: output + ".json", bytes: manifest.bytes }));
  } catch (e) {
    child.kill();
    throw e;
  } finally {
    key.fill(0);
  }
}
function restore(file, name) {
  if (!/^markos_media_restore_[a-z0-9_]+$/.test(name || "")) throw Error("Choose a new markos_media_restore_* directory");
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  if (m.format !== "markos-media-aes256gcm-dpapi-v1" || path.basename(m.file) !== m.file) throw Error("Invalid manifest");
  const key = dpapi(Buffer.from(m.wrappedKey, "base64"), true),
    decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(m.iv, "base64"));
  decipher.setAuthTag(Buffer.from(m.tag, "base64"));
  let raw;
  try {
    raw = Buffer.concat([decipher.update(fs.readFileSync(path.join(path.dirname(path.resolve(file)), m.file))), decipher.final()]);
  } finally {
    key.fill(0);
  }
  const [header, ...records] = raw
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  raw.fill(0);
  if (header.kind !== "markos-media-v1" || header.count !== records.length) throw Error("Incomplete media backup");
  const ids = new Set();
  for (const r of records) {
    if (!/^[a-f0-9-]{36}$/.test(r.id) || ids.has(r.id) || !r.s3Key.includes(r.workspaceId)) throw Error("Invalid media identity");
    ids.add(r.id);
    const bytes = Buffer.from(r.data, "base64");
    if (bytes.length !== r.sizeBytes || crypto.createHash("sha256").update(bytes).digest("hex") !== r.sha256) throw Error("Media verification failed");
  }
  const folder = path.join(root, "var", name);
  fs.mkdirSync(folder);
  let bytes = 0;
  for (const r of records) {
    const data = Buffer.from(r.data, "base64");
    fs.writeFileSync(path.join(folder, r.id + ".data"), data, { flag: "wx" });
    const restored = fs.readFileSync(path.join(folder, r.id + ".data"));
    if (crypto.createHash("sha256").update(restored).digest("hex") !== r.sha256) throw Error("Restored file verification failed");
    bytes += data.length;
  }
  fs.writeFileSync(
    path.join(folder, "objects.json"),
    JSON.stringify(
      records.map(({ data, ...metadata }) => metadata),
      null,
      2
    ),
    { flag: "wx" }
  );
  const proof = { restoredAt: new Date().toISOString(), objects: records.length, bytes, allHashesMatched: true, directory: folder };
  fs.writeFileSync(path.resolve(file) + ".restore-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
}
(async () => {
  if (process.argv[2] === "backup") await backup(process.argv[3]);
  else if (process.argv[2] === "restore") restore(process.argv[3], process.argv[4]);
  else throw Error("Choose backup or restore");
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
