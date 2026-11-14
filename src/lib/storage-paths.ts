// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-00809c4b
import path from "path";

/**
 * Returns the resolved directory for persistent JSON and cache data.
 * When `process.env.OPEN_CAROUSEL_DATA_DIR` is set (e.g. in packaged Electron),
 * uses that path. During development, defaults to `<projectRoot>/data`.
 */
export function getDataDir(): string {
  if (process.env.OPEN_CAROUSEL_DATA_DIR) {
    return path.resolve(process.env.OPEN_CAROUSEL_DATA_DIR);
  }
  return path.resolve(process.cwd(), "data");
}

/**
 * Returns the resolved directory for user uploaded assets (images, fonts).
 * Can be explicitly set via `process.env.OPEN_CAROUSEL_UPLOADS_DIR`.
 * Otherwise, if `OPEN_CAROUSEL_DATA_DIR` is set, defaults to `<DATA_DIR>/uploads`.
 * During development, defaults to `<projectRoot>/public/uploads`.
 */
export function getUploadsDir(): string {
  if (process.env.OPEN_CAROUSEL_UPLOADS_DIR) {
    return path.resolve(process.env.OPEN_CAROUSEL_UPLOADS_DIR);
  }
  if (process.env.OPEN_CAROUSEL_DATA_DIR) {
    return path.resolve(process.env.OPEN_CAROUSEL_DATA_DIR, "uploads");
  }
  return path.resolve(process.cwd(), "public", "uploads");
}

/**
 * Returns the directory for Google font cache.
 */
export function getFontCacheDir(): string {
  return path.join(getDataDir(), ".font-cache");
}
