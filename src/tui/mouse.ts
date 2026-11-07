/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { useStdin, useStdout } from "ink";
import { useEffect, useEffectEvent } from "react";

export interface MouseEvent {
  x: number;
  y: number;
  action: "click" | "scrollUp" | "scrollDown";
}

const actions: Partial<Record<string, MouseEvent["action"]>> = {
  "0": "click",
  "64": "scrollUp",
  "65": "scrollDown",
};

export function useMouse(onMouse: (event: MouseEvent) => void) {
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const handleMouse = useEffectEvent(onMouse);

  useEffect(() => {
    let pending = "";
    let pasting = false;

    function read(chunk: string | Buffer) {
      const input = pending + chunk.toString();
      // Keep only a partial SGR report or bracketed-paste marker across reads.
      pending =
        input.match(/\x1b(?:\[(?:<[\d;]{0,32}|20[01]?|2)?)?$/)?.[0] ?? "";

      for (const [, paste, button, column, row, kind] of input.matchAll(
        /\x1b\[(?:(200|201)~|<(\d+);(\d+);(\d+)([Mm]))/g,
      )) {
        if (paste) {
          pasting = paste === "200";
          continue;
        }
        if (pasting || kind !== "M") continue;

        const action = actions[button];
        if (action) {
          handleMouse({ x: Number(column) - 1, y: Number(row) - 1, action });
        }
      }
    }

    stdin.on("data", read);
    stdout.write("\x1b[?1006h\x1b[?1000h");
    return () => {
      stdin.removeListener("data", read);
      stdout.write("\x1b[?1000l\x1b[?1006l");
    };
  }, [stdin, stdout]);
}
