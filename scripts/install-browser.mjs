import fs from "fs/promises";
import path from "path";
import { existsSync, chmodSync } from "fs";
import {
  install,
  resolveBuildId,
  Browser,
  BrowserPlatform,
} from "@puppeteer/browsers";

const TARGET_DIR = path.resolve(process.cwd(), "bundled-chromium");
const PINNED_BUILD_ID = "146.0.7680.153";

async function installPlatformBrowser(platformName) {
  const isWindows = platformName === "win64" || platformName === "win32";
  const expectedExecutable = isWindows
    ? path.join(TARGET_DIR, "chrome-win64", "chrome.exe")
    : path.join(TARGET_DIR, "chrome-linux64", "chrome");

  if (existsSync(expectedExecutable)) {
    console.log(`✓ Bundled Chrome for ${platformName} already present at: ${expectedExecutable}`);
    if (!isWindows) {
      try {
        chmodSync(expectedExecutable, 0o755);
      } catch {}
    }
    return expectedExecutable;
  }

  // Check if cache from development machine exists
  const devCacheChrome = path.resolve(
    process.env.HOME || "",
    `.cache/puppeteer/chrome/${isWindows ? "win64" : "linux"}-${PINNED_BUILD_ID}/${isWindows ? "chrome-win64" : "chrome-linux64"}`
  );

  if (existsSync(devCacheChrome)) {
    console.log(`Copying verified Chrome ${PINNED_BUILD_ID} from local cache into ${TARGET_DIR}...`);
    await fs.mkdir(TARGET_DIR, { recursive: true });
    await fs.cp(
      devCacheChrome,
      path.join(TARGET_DIR, isWindows ? "chrome-win64" : "chrome-linux64"),
      { recursive: true }
    );
    if (!isWindows) {
      try {
        chmodSync(expectedExecutable, 0o755);
      } catch {}
    }
    console.log(`✓ Copied and configured bundled Chrome at: ${expectedExecutable}`);
    return expectedExecutable;
  }

  // Otherwise download pinned build using @puppeteer/browsers
  console.log(`Downloading Chrome browser for ${platformName} via @puppeteer/browsers...`);
  const browserPlatform = isWindows ? BrowserPlatform.WIN64 : BrowserPlatform.LINUX;
  let buildId = PINNED_BUILD_ID;

  try {
    const installed = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: TARGET_DIR,
      platform: browserPlatform,
    });
    console.log(`✓ Installed Chrome to: ${installed.executablePath}`);
    if (!isWindows) {
      chmodSync(installed.executablePath, 0o755);
    }
    return installed.executablePath;
  } catch (err) {
    console.warn(`Could not install pinned build ${PINNED_BUILD_ID}, trying stable...`, err);
    buildId = await resolveBuildId(Browser.CHROME, browserPlatform, "stable");
    const installed = await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: TARGET_DIR,
      platform: browserPlatform,
    });
    console.log(`✓ Installed Chrome stable to: ${installed.executablePath}`);
    if (!isWindows) {
      chmodSync(installed.executablePath, 0o755);
    }
    return installed.executablePath;
  }
}

async function main() {
  const argPlatform = process.argv.find((a) => a.startsWith("--platform="))?.split("=")[1];
  const target = argPlatform || (process.platform === "win32" ? "win64" : "linux");

  console.log(`Checking project-local bundled Chrome for target: ${target}...`);

  if (target === "all") {
    await installPlatformBrowser("linux");
    await installPlatformBrowser("win64");
  } else {
    await installPlatformBrowser(target);
  }
}

main().catch((err) => {
  console.error("Failed to install browser:", err);
  process.exit(1);
});
