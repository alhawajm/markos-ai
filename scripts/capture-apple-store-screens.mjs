import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "var/native-apple-store-captures");
const temporary = process.env.RUNNER_TEMP;
const app = process.env.MARKOS_SIMULATOR_APP;
if (process.platform !== "darwin" || !temporary || !app || !existsSync(app)) throw new Error("A genuine Mac simulator build is required");
if (!process.env.MAESTRO_STORE_EMAIL || !process.env.MAESTRO_STORE_PASSWORD) throw new Error("Protected fictional reviewer credentials are required");

const command = (binary, args, options = {}) => execFileSync(binary, args, { encoding: "utf8", timeout: 120_000, ...options });
const deviceList = JSON.parse(command("xcrun", ["simctl", "list", "devices", "available", "--json"]));
const devices = Object.entries(deviceList.devices)
  .filter(([runtime]) => runtime.includes("iOS"))
  .reverse()
  .flatMap(([, list]) => list);
const available = [
  { kind: "iphone", device: devices.find((d) => d.name === "iPhone 17 Pro") },
  { kind: "ipad", device: devices.find((d) => /^iPad Pro 13-inch/.test(d.name)) }
];
const captureKind = process.env.MARKOS_CAPTURE_DEVICE_KIND ?? "all";
if (!["all", "iphone", "ipad"].includes(captureKind)) throw new Error("Invalid capture device kind");
const selected = available.filter((item) => captureKind === "all" || item.kind === captureKind);
if (selected.some((item) => !item.device)) throw new Error("The runner needs an iPhone 17 Pro and a 13-inch iPad simulator");
await mkdir(output, { recursive: true });
const receipt = { source: "Native iOS simulator screenshots", syntheticUi: false, backendMocked: false, commit: process.env.GITHUB_SHA, devices: [] };
const receiptPath = path.join(output, captureKind === "all" ? "capture-receipt.json" : `capture-receipt-${captureKind}.json`);
if (process.env.MARKOS_SIMULATOR_BUILD_META) {
  const nativeBuild = JSON.parse(await readFile(process.env.MARKOS_SIMULATOR_BUILD_META, "utf8"));
  if (nativeBuild.bundleIdentifier !== "com.markos.mobile" || nativeBuild.appVersion !== "0.5.0") throw new Error("Wrong simulator app identity");
  receipt.nativeBuildCommit = nativeBuild.commit;
}

async function pngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? pngFiles(path.join(directory, entry.name)) : entry.name.endsWith(".png") ? [path.join(directory, entry.name)] : []
    )
  );
  return lists.flat();
}

const failures = [];
for (const { kind, device } of selected) {
  const id = device.udid;
  const artifactDirectory = path.join(temporary, `maestro-${kind}`);
  try {
    if (device.state !== "Booted") command("xcrun", ["simctl", "boot", id]);
    command("xcrun", ["simctl", "bootstatus", id, "-b"], { timeout: 180_000 });
    command("xcrun", [
      "simctl",
      "status_bar",
      id,
      "override",
      "--time",
      "09:41",
      "--dataNetwork",
      "wifi",
      "--wifiMode",
      "active",
      "--wifiBars",
      "3",
      "--batteryState",
      "charged",
      "--batteryLevel",
      "100"
    ]);
    command("xcrun", ["simctl", "ui", id, "appearance", "light"]);
    command("xcrun", ["simctl", "install", id, app]);
    const maestroArgs = ["--device", id, "test", "--test-output-dir", artifactDirectory, "apps/mobile/maestro/store-capture.yaml"];
    // Credentials stay in the inherited MAESTRO_ environment, never command-line arguments.
    let flowFailed = false;
    try {
      command("maestro", maestroArgs, { timeout: 600_000, stdio: "inherit" });
    } catch {
      flowFailed = true;
    }
    const allPngs = existsSync(artifactDirectory) ? await pngFiles(artifactDirectory) : [];
    const captures = allPngs.filter((file) => path.basename(file).startsWith("store-"));
    if (flowFailed && !captures.length) {
      // This explicit frame is taken before any credentials are entered. Never retain general failure screenshots.
      const emptyLogin = allPngs.find((file) => path.basename(file) === "diagnostic-empty-login.png");
      if (emptyLogin) await copyFile(emptyLogin, path.join(output, `${kind}-diagnostic-empty-login.png`));
    }
    const records = [];
    for (const file of captures) {
      const bytes = await readFile(file);
      if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Invalid simulator PNG");
      const width = bytes.readUInt32BE(16),
        height = bytes.readUInt32BE(20);
      const allowed =
        kind === "iphone"
          ? [
              [1206, 2622],
              [1179, 2556]
            ]
          : [
              [2064, 2752],
              [2048, 2732]
            ];
      if (!allowed.some(([w, h]) => width === w && height === h)) throw new Error(`Unexpected ${kind} screenshot dimensions ${width}x${height}`);
      const destination = `${kind}-${path.basename(file, ".png")}.jpg`;
      // JPEG removes the screenshot's alpha channel without changing its native layout or dimensions.
      command("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", file, "--out", path.join(output, destination)]);
      records.push({ file: destination, width, height, native: true, conversion: "PNG to JPEG only", uploadedToStore: false });
    }
    receipt.devices.push({ kind, name: device.name, screenshots: records });
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
    if (flowFailed || captures.length < 4) failures.push(kind);
  } finally {
    try {
      command("xcrun", ["simctl", "shutdown", id]);
    } catch {
      /* Runner cleanup also removes the disposable simulator. */
    }
  }
}
await writeFile(receiptPath, JSON.stringify(receipt, null, 2));
if (failures.length) throw new Error(`Native capture flow incomplete for ${failures.join(", ")}; completed candidate screenshots were retained`);
console.log(JSON.stringify({ nativeScreenshotsCaptured: true, devices: receipt.devices.map((d) => ({ kind: d.kind, count: d.screenshots.length })) }));
