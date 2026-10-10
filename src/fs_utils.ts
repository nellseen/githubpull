import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export const IGNORE_LIST = ['.DS_Store', '__pycache__', '.cache', 'thumbs.db'];

/**
 * Clean garbage/temporary files and directories recursively (.DS_Store, __pycache__, etc.)
 */
export function cleanJunkFiles(directory: string): number {
  let cleanedCount = 0;
  if (!fs.existsSync(directory)) return cleanedCount;

  function walk(currentDir: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (IGNORE_LIST.includes(entry.name)) {
        try {
          if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          cleanedCount++;
        } catch {
          // ignore
        }
      } else if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(directory);
  return cleanedCount;
}

/**
 * If extracted directory contains only a single top-level directory, hoists contents up.
 */
export function flattenDirectory(targetDir: string): number {
  let flattenedLevels = 0;
  if (!fs.existsSync(targetDir)) return flattenedLevels;

  while (flattenedLevels < 5) {
    const items = fs.readdirSync(targetDir).filter((item) => item !== '.git' && !IGNORE_LIST.includes(item));
    if (items.length === 1) {
      const singlePath = path.join(targetDir, items[0]);
      try {
        if (fs.statSync(singlePath).isDirectory()) {
          const subItems = fs.readdirSync(singlePath);
          for (const sub of subItems) {
            const from = path.join(singlePath, sub);
            const to = path.join(targetDir, sub);
            fs.renameSync(from, to);
          }
          fs.rmdirSync(singlePath);
          flattenedLevels++;
          continue;
        }
      } catch {
        break;
      }
    }
    break;
  }
  return flattenedLevels;
}

/**
 * Unzips an archive into the target directory safely.
 */
export function extractZip(zipPath: string, targetDir: string): void {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP file not found at: ${zipPath}`);
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}
