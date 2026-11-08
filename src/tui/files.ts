/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export interface DirectoryEntry {
  name: string;
  kind: "folder" | "file";
}

export function displayText(value: string): string {
  return value.replace(/\p{Cc}/gu, "�");
}

export function errorReason(error: unknown): string {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return displayText(code ?? String(error));
}

export function readDirectory(directory: string, mode: "folders" | "files-and-folders") {
  const parent: DirectoryEntry[] = dirname(directory) === directory ? [] : [{ name: "..", kind: "folder" }];
  try {
    const entries: DirectoryEntry[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      try {
        const info = entry.isSymbolicLink() ? statSync(join(directory, entry.name)) : entry;
        if (info.isDirectory()) entries.push({ name: entry.name, kind: "folder" });
        else if (mode === "files-and-folders" && info.isFile()) entries.push({ name: entry.name, kind: "file" });
      } catch {
        // Skip links whose targets cannot be read.
      }
    }
    entries.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === "folder" ? -1 : 1;
    });
    return { entries: [...parent, ...entries], error: undefined };
  } catch (error) {
    return { entries: parent, error: `Cannot open folder (${errorReason(error)}).` };
  }
}
