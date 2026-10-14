/**
 * Read-only TWA release artifact and hosted-origin checker.
 *
 * It does not build, sign, install or deploy an APK. Hosted requests are
 * anonymous GETs and response bodies are never printed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const apkArg = process.argv.indexOf("--apk");
const apk = apkArg >= 0 ? (process.argv[apkArg + 1] || "") : "audit/twa-experiment/workflow-twa-app-entry-candidate-20261012.apk";
const expectedPackage = "com.workflow.twa.experiment";
const expectedHost = "workflow-application.netlify.app";
const expectedFingerprint = "EFA74CEC8596408E184AE59636F6A66A1B84620921875AB758F0198AAD93F399";

function tool(name, fallback) {
  if (process.env[name]) return process.env[name];
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  if (!sdk) return fallback;
  return join(sdk, ...fallback.split("\\"));
}

function run(command, args) {
  try {
    if (/\.bat$/i.test(command)) {
      return execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", "call", command, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${command} unavailable: ${message.slice(0, 180)}`);
  }
}

function readLocalAssetLinks() {
  const path = join(root, "public", ".well-known", "assetlinks.json");
  if (!existsSync(path)) return { path, exists: false, matches: false };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const target = data.find((entry) => entry?.target?.package_name === expectedPackage);
    const fingerprints = target?.target?.sha256_cert_fingerprints ?? [];
    const normalized = fingerprints.map((value) => String(value).replaceAll(":", "").toUpperCase());
    return { path, exists: true, matches: normalized.includes(expectedFingerprint) };
  } catch {
    return { path, exists: true, matches: false, invalidJson: true };
  }
}

async function hostedCheck() {
  const paths = ["/app-entry", "/manifest.webmanifest", "/.well-known/assetlinks.json"];
  const results = {};
  for (const path of paths) {
    try {
      const response = await fetch(`https://${expectedHost}${path}`, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
      results[path] = { status: response.status, contentType: response.headers.get("content-type") };
    } catch (error) {
      results[path] = { error: error instanceof Error ? error.name : "request_failed" };
    }
  }
  return results;
}

const result = {
  apk: { path: apk, exists: existsSync(join(root, apk)), package: null, launchableActivity: null, certificateSha256: null },
  expected: { package: expectedPackage, host: expectedHost, launchPath: "/app-entry", certificateSha256: expectedFingerprint },
  localAssetLinks: readLocalAssetLinks(),
  hosted: {},
};

try {
  const apkPath = join(root, apk);
  if (result.apk.exists) {
    const aapt = tool("AAPT_PATH", "build-tools\\36.0.0\\aapt.exe");
    const signer = tool("APKSIGNER_PATH", "build-tools\\36.0.0\\apksigner.bat");
    const badging = run(aapt, ["dump", "badging", apkPath]);
    result.apk.package = badging.match(/package: name='([^']+)'/)?.[1] ?? null;
    result.apk.launchableActivity = badging.match(/launchable-activity: name='([^']+)'/)?.[1] ?? null;
    const certs = run(signer, ["verify", "--print-certs", apkPath]);
    result.apk.certificateSha256 = certs.match(/SHA-256 digest: ([0-9a-f:]+)/i)?.[1]?.replaceAll(":", "").toUpperCase() ?? null;
  }
} catch (error) {
  result.apk.error = error instanceof Error ? error.message : "artifact_check_failed";
}

result.hosted = await hostedCheck();
result.status = result.apk.package === expectedPackage &&
  result.apk.certificateSha256 === expectedFingerprint &&
  result.localAssetLinks.matches &&
  result.hosted["/.well-known/assetlinks.json"]?.status === 200
  ? "READY_FOR_HOSTED_VALIDATION"
  : "BLOCKED_OR_UNVERIFIED";
console.log(JSON.stringify(result, null, 2));
