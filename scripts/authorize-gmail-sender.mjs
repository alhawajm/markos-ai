import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scope = "https://www.googleapis.com/auth/gmail.send";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recoveryFile = join(repository, "var", "release-prep", "gmail-sender-oauth.dpapi");
function recoveryRecord(value) {
  const protect = value !== undefined;
  const script = protect
    ? "$plain=[Console]::In.ReadToEnd();$secure=ConvertTo-SecureString -String $plain -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure))"
    : "$secure=ConvertTo-SecureString -String ([Console]::In.ReadToEnd());$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}";
  const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: protect ? JSON.stringify(value) : readFileSync(recoveryFile, "utf8"),
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
    stdio: ["pipe", "pipe", "ignore"]
  });
  if (!protect) return JSON.parse(result);
  mkdirSync(dirname(recoveryFile), { recursive: true });
  writeFileSync(recoveryFile, result);
}
const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index++) {
  const name = process.argv[index];
  if (name === "--resume" || name === "--help") continue;
  argumentsMap.set(name, process.argv[++index]);
}
const required = (name) => {
  const value = argumentsMap.get(name);
  if (!value || value.startsWith("--")) throw new Error("GMAIL_SETUP_ARGUMENT_MISSING");
  return value;
};

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Authorize the operator-only Gmail sender, test acceptance, and install sealed Railway credentials. Does not activate a provider.\nRequired: --sender <Gmail address> --recipient <authorized test inbox> --project <Railway project ID> --environment <production environment ID> --api-service <service ID>\nFor new authorization: --client <private Desktop OAuth JSON>. To recover an interrupted installation: --resume (reads the workstation's encrypted DPAPI checkpoint and preserves accepted tests).\nSet MARKOS_RAILWAY_CLI if Railway is not on PATH; an expired Railway access token is refreshed before each request. Keep billing disabled."
    );
    return;
  }
  const sender = required("--sender"),
    recipient = required("--recipient");
  if (!/^[A-Za-z0-9._%+-]+@gmail\.com$/.test(sender) || !/^[^\s<>\r\n,]+@[^\s<>\r\n,]+\.[A-Za-z]{2,}$/.test(recipient))
    throw new Error("GMAIL_SETUP_ADDRESS_INVALID");
  const projectId = required("--project"),
    environmentId = required("--environment"),
    serviceId = required("--api-service");
  for (const value of [projectId, environmentId, serviceId]) if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error("GMAIL_SETUP_TARGET_INVALID");
  let client;
  if (!process.argv.includes("--resume")) {
    const filename = resolve(required("--client")),
      clientRelative = relative(repository, filename);
    if (!clientRelative.startsWith(`..${sep}`) && !clientRelative.startsWith(`var${sep}`)) throw new Error("GMAIL_SETUP_CLIENT_MUST_BE_PRIVATE");
    client = JSON.parse(readFileSync(filename, "utf8")).installed;
    if (!client?.client_id || !client.client_secret || client.token_uri !== "https://oauth2.googleapis.com/token")
      throw new Error("GMAIL_SETUP_DESKTOP_CLIENT_REQUIRED");
  }
  async function railway(query, variables) {
    // The Google check can outlast Railway's short access-token lifetime.
    let user = JSON.parse(readFileSync(join(homedir(), ".railway", "config.json"), "utf8")).user;
    if (user?.tokenExpiresAt && Number(user.tokenExpiresAt) * 1000 <= Date.now() + 60000) {
      try {
        execFileSync(process.env.MARKOS_RAILWAY_CLI || "railway", ["status", "--json", "--project", projectId, "--environment", environmentId], {
          windowsHide: true,
          timeout: 30000,
          stdio: "ignore"
        });
        user = JSON.parse(readFileSync(join(homedir(), ".railway", "config.json"), "utf8")).user;
      } catch {
        throw new Error("GMAIL_SETUP_RAILWAY_LOGIN_REQUIRED");
      }
    }
    const railwayToken = user?.accessToken || user?.token;
    if (!railwayToken) throw new Error("GMAIL_SETUP_RAILWAY_LOGIN_REQUIRED");
    const response = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${railwayToken}` },
      body: JSON.stringify({ query, variables })
    });
    const body = await response.json();
    if (!response.ok || body.errors || !body.data) {
      const unauthorized = response.status === 401 || body.errors?.some((error) => /^(Not Authorized|Unauthorized|Unauthenticated)$/i.test(error.message));
      throw new Error(unauthorized ? "GMAIL_SETUP_RAILWAY_LOGIN_REQUIRED" : "GMAIL_SETUP_RAILWAY_REQUEST_FAILED");
    }
    return body.data;
  }
  // Verify the exact project/environment/service before asking for any mailbox access.
  const target = (await railway("query($id:String!){project(id:$id){environments{edges{node{id name}}} services{edges{node{id name}}}}}", { id: projectId }))
    .project;
  if (
    !target?.environments.edges.some(({ node }) => node.id === environmentId && node.name === "production") ||
    !target.services.edges.some(({ node }) => node.id === serviceId && node.name === "api")
  )
    throw new Error("GMAIL_SETUP_TARGET_MISMATCH");
  let credentials,
    testAccepted = false;
  const checkpoint = () => recoveryRecord({ credentials, testAccepted, sender, recipient, projectId, environmentId, serviceId });
  if (process.argv.includes("--resume")) {
    const saved = recoveryRecord();
    if (
      ["sender", "recipient", "projectId", "environmentId", "serviceId"].some(
        (key) => saved[key] !== { sender, recipient, projectId, environmentId, serviceId }[key]
      )
    )
      throw new Error("GMAIL_SETUP_RECOVERY_TARGET_MISMATCH");
    credentials = saved.credentials;
    if (
      !credentials ||
      ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"].some((key) => typeof credentials[key] !== "string" || !credentials[key])
    )
      throw new Error("GMAIL_SETUP_RECOVERY_INVALID");
    if (saved.testAccepted === "UNKNOWN") throw new Error("GMAIL_SETUP_TEST_RESULT_UNKNOWN");
    testAccepted = saved.testAccepted === true;
  } else {
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(48).toString("base64url");
    let finish, fail;
    const callback = new Promise((resolveCode, rejectCode) => {
      finish = resolveCode;
      fail = rejectCode;
    });
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const received = Buffer.from(url.searchParams.get("state") ?? ""),
        expected = Buffer.from(state);
      if (request.method !== "GET" || url.pathname !== "/oauth2/callback" || received.length !== expected.length || !timingSafeEqual(received, expected)) {
        response.writeHead(400).end("Invalid authorization response.");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error")) {
        response.writeHead(400).end("Authorization was not completed.");
        fail(new Error("GMAIL_SETUP_AUTHORIZATION_DECLINED"));
        return;
      }
      response
        .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
        .end("Google authorization received. Return to MARKOS setup; you may close this tab.");
      finish(code);
    });
    await new Promise((ready, reject) => {
      server.once("error", () => reject(new Error("GMAIL_SETUP_CALLBACK_UNAVAILABLE")));
      server.listen(0, "127.0.0.1", ready);
    });
    server.on("error", () => fail(new Error("GMAIL_SETUP_CALLBACK_UNAVAILABLE")));
    const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2/callback`;
    const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorization.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      login_hint: sender,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256"
    }).toString();
    const timeout = setTimeout(() => fail(new Error("GMAIL_SETUP_AUTHORIZATION_TIMED_OUT")), 10 * 60_000);
    let code;
    try {
      if (process.platform !== "win32") throw new Error("GMAIL_SETUP_USE_WINDOWS_WORKSTATION");
      const browser = spawn("powershell.exe", ["-NoProfile", "-Command", "Start-Process $env:MARKOS_GMAIL_AUTHORIZATION_URL"], {
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, MARKOS_GMAIL_AUTHORIZATION_URL: authorization.href }
      });
      browser.on("error", () => fail(new Error("GMAIL_SETUP_BROWSER_UNAVAILABLE")));
      browser.on("exit", (status) => {
        if (status) fail(new Error("GMAIL_SETUP_BROWSER_UNAVAILABLE"));
      });
      console.log(
        "Complete Google sign-in and the send-only permission in the browser on this PC. Keep passwords/codes there; no authorization URL or token is logged."
      );
      code = await callback;
    } finally {
      clearTimeout(timeout);
      server.closeAllConnections();
      await new Promise((closed) => server.close(closed));
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        client_secret: client.client_secret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });
    const grant = await response.json();
    if (!response.ok || !grant.refresh_token || grant.scope !== scope || grant.token_type?.toLowerCase() !== "bearer")
      throw new Error("GMAIL_SETUP_SEND_ONLY_GRANT_REQUIRED");
    credentials = { GMAIL_CLIENT_ID: client.client_id, GMAIL_CLIENT_SECRET: client.client_secret, GMAIL_REFRESH_TOKEN: grant.refresh_token };
    checkpoint();
  }
  const requireApi = createRequire(join(repository, "apps", "api", "package.json"));
  const { tsImport } = await import(pathToFileURL(requireApi.resolve("tsx/esm/api")).href);
  const { emailConfiguration, EmailDeliveryError, sendTransactionalMail } = await tsImport("../apps/api/src/email/transactional-mail.ts", import.meta.url);
  // Use the real transport, including a fresh refresh-token exchange. Acceptance is not receipt.
  if (!testAccepted) {
    testAccepted = "UNKNOWN";
    checkpoint();
    try {
      await sendTransactionalMail(emailConfiguration({ ...credentials, EMAIL_PROVIDER: "gmail", FROM_EMAIL: sender }), {
        to: [recipient],
        subject: "MARKOS Gmail delivery check",
        text: "MARKOS can now submit transactional email through its own Gmail sender. This is the authorized delivery check. Please confirm receipt; Google acceptance alone does not prove inbox delivery."
      });
    } catch (error) {
      if (error instanceof EmailDeliveryError && error.code !== "EMAIL_RESULT_UNKNOWN") {
        testAccepted = false;
        checkpoint();
      }
      throw error;
    }
    testAccepted = true;
    checkpoint();
  }
  const patch = {
    services: { [serviceId]: { variables: Object.fromEntries(Object.entries(credentials).map(([name, value]) => [name, { value, isSealed: true }])) } }
  };
  await railway(
    'mutation($environmentId:String!,$patch:EnvironmentConfig!){environmentPatchCommit(environmentId:$environmentId,patch:$patch,skipDeploys:true,commitMessage:"Configure operator Gmail sender credentials")}',
    { environmentId, patch }
  );
  console.log(
    "Google accepted the controlled test. Gmail credentials installed as sealed API variables; provider selection is unchanged. Record inbox receipt separately. Reference credentials from worker/backup and deploy the affected services when selecting this sender."
  );
}

main().catch((error) => {
  const message = error instanceof Error && /^GMAIL_SETUP_[A-Z_]+$/.test(error.message) ? error.message : "GMAIL_SETUP_FAILED";
  console.error(message);
  process.exitCode = 1;
});
