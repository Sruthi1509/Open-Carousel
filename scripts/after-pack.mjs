import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export default async function afterPack(context) {
  const standaloneDest = path.join(context.appOutDir, "resources", "standalone");
  const nodeModulesSrc = path.resolve(process.cwd(), ".next", "standalone", "node_modules");
  const nodeModulesDest = path.join(standaloneDest, "node_modules");

  if (!existsSync(nodeModulesDest) && existsSync(nodeModulesSrc)) {
    console.log("Copying standalone node_modules into packaged resources...");
    await fs.cp(nodeModulesSrc, nodeModulesDest, { recursive: true });
    console.log("✓ Copied standalone node_modules");
  }

  // Ensure cross-platform Sharp native modules are present in standalone node_modules
  const rootImgModules = path.resolve(process.cwd(), "node_modules", "@img");
  const destImgModules = path.join(nodeModulesDest, "@img");
  if (existsSync(rootImgModules)) {
    await fs.mkdir(destImgModules, { recursive: true });
    const entries = await fs.readdir(rootImgModules);
    for (const entry of entries) {
      const srcEntry = path.join(rootImgModules, entry);
      const destEntry = path.join(destImgModules, entry);
      if (!existsSync(destEntry)) {
        await fs.cp(srcEntry, destEntry, { recursive: true });
        console.log(`✓ Copied ${entry} to standalone node_modules/@img`);
      }
    }
  }

  // Ensure packaged Linux Chrome has executable permissions if present
  const chromeLinuxPath = path.join(
    context.appOutDir,
    "resources",
    "chromium",
    "chrome-linux64",
    "chrome"
  );
  if (existsSync(chromeLinuxPath)) {
    await fs.chmod(chromeLinuxPath, 0o755);
    console.log("✓ Verified executable permissions on packaged Linux Chrome binary");
  }

  // Check packaged Windows Chrome
  const chromeWinPath = path.join(
    context.appOutDir,
    "resources",
    "chromium",
    "chrome-win64",
    "chrome.exe"
  );
  if (existsSync(chromeWinPath)) {
    console.log("✓ Verified packaged Windows Chrome executable");
  }
}
