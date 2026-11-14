import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

async function main() {
  const root = process.cwd();
  const standaloneNext = path.join(root, ".next", "standalone", ".next");
  const standalonePublic = path.join(root, ".next", "standalone", "public");

  console.log("Preparing standalone distribution assets...");

  // Copy .next/static -> .next/standalone/.next/static
  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(standaloneNext, "static");
  if (existsSync(staticSrc)) {
    await fs.cp(staticSrc, staticDest, { recursive: true });
    console.log("✓ Copied .next/static to standalone");
  }

  // Copy public -> .next/standalone/public
  const publicSrc = path.join(root, "public");
  if (existsSync(publicSrc)) {
    await fs.cp(publicSrc, standalonePublic, { recursive: true });
    console.log("✓ Copied public to standalone");
  }

  // Ensure cross-platform @img modules (e.g. sharp-win32-x64) are in standalone node_modules
  const rootImg = path.join(root, "node_modules", "@img");
  const standaloneImg = path.join(root, ".next", "standalone", "node_modules", "@img");
  if (existsSync(rootImg)) {
    await fs.mkdir(standaloneImg, { recursive: true });
    const imgEntries = await fs.readdir(rootImg);
    for (const entry of imgEntries) {
      const srcPath = path.join(rootImg, entry);
      const destPath = path.join(standaloneImg, entry);
      if (!existsSync(destPath)) {
        await fs.cp(srcPath, destPath, { recursive: true });
        console.log(`✓ Copied @img/${entry} to standalone node_modules`);
      }
    }
  }

  console.log("Standalone preparation complete.");
}

main().catch((err) => {
  console.error("Preparation failed:", err);
  process.exit(1);
});
