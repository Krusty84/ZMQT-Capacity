/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Box, measureElement, Text, useInput, type DOMElement } from "ink";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Serialization } from "../models/input.js";
import { displayText, errorReason, readDirectory, type DirectoryEntry } from "./files.js";
import type { MouseEvent } from "./mouse.js";

function measurePayload(path: string, serialization: Serialization): { bytes: number } | { error: string } {
  try {
    const file = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    try {
      const info = fstatSync(file);
      if (!info.isFile()) return { error: "Choose a regular file." };
      if (serialization === "protobuf") {
        if (info.size === 0) return { error: "Protobuf payload is empty." };
        if (!Number.isSafeInteger(info.size)) return { error: "Payload size must be a safe integer." };
        return { bytes: info.size };
      }

      const data = readFileSync(file);
      try {
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
        return { bytes: Buffer.byteLength(JSON.stringify(value), "utf8") };
      } catch (error) {
        const reason = errorReason(error);
        return { error: error instanceof SyntaxError || reason === "ERR_ENCODING_INVALID_ENCODED_DATA"
          ? "Expected valid UTF-8 JSON."
          : `Cannot compact JSON (${reason}).` };
      }
    } finally {
      closeSync(file);
    }
  } catch (error) {
    return { error: `Cannot read payload (${errorReason(error)}).` };
  }
}

const width = 64;
const listRows = 6;
const height = listRows + 6;

interface DialogState {
  directory: string;
  entries: DirectoryEntry[];
  selected: number;
  cancelFocused: boolean;
  error?: string;
}

function openDirectory(directory: string): DialogState {
  return { directory, ...readDirectory(directory, "files-and-folders"), selected: 0, cancelFocused: false };
}

interface PayloadDialogProps {
  serialization: Serialization;
  columns: number;
  panelHeight: number;
  visible: boolean;
  mouseHandler: Ref<(event: MouseEvent) => void>;
  onClose: (bytes?: number) => void;
}

export function PayloadDialog({ serialization, columns, panelHeight, visible, mouseHandler, onClose }: PayloadDialogProps) {
  const [state, setState] = useState(() => openDirectory(process.cwd()));
  const latest = useRef<DialogState | undefined>(state);
  const list = useRef<DOMElement>(null);
  const cancel = useRef<DOMElement>(null);
  const first = Math.max(0, state.selected - listRows + 1);

  function update(next: DialogState) {
    latest.current = next;
    setState(next);
  }

  function close(bytes?: number) {
    latest.current = undefined;
    onClose(bytes);
  }

  function moveSelection(current: DialogState, offset: number) {
    const selected = Math.max(0, Math.min(current.selected + offset, current.entries.length - 1));
    update({ ...current, selected, cancelFocused: false });
  }

  function activate(current: DialogState, index: number) {
    const entry = current.entries[index];
    if (!entry) return;
    const path = join(current.directory, entry.name);
    if (entry.kind === "folder") {
      update(openDirectory(path));
      return;
    }
    const result = measurePayload(path, serialization);
    if ("error" in result) update({ ...current, selected: index, cancelFocused: false, error: result.error });
    else close(result.bytes);
  }

  useInput((input, key) => {
    if (key.eventType === "release" || key.ctrl || key.meta || key.super || key.hyper) return;
    for (const part of input.length > 1 ? input.split(/([\t\r])/).filter(Boolean) : [input]) {
      const current = latest.current;
      if (!current) return;
      if (key.escape) {
        close();
        return;
      }
      if (key.tab || part === "\t") {
        update({ ...current, cancelFocused: !current.cancelFocused });
      } else if (key.return || part === "\r" || part === " ") {
        if (current.cancelFocused) close();
        else activate(current, current.selected);
      } else if (!current.cancelFocused && (key.upArrow || key.downArrow)) {
        moveSelection(current, key.upArrow ? -1 : 1);
      }
    }
  }, { isActive: visible });

  useImperativeHandle(mouseHandler, () => ({ action, x, y }) => {
    const current = latest.current;
    if (!current || !list.current || !cancel.current) return;
    const contains = (area: ReturnType<typeof measureElement>) =>
      x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height;
    const area = measureElement(list.current);
    if (contains(area)) {
      if (action !== "click") moveSelection(current, action === "scrollUp" ? -3 : 3);
      else if (current.entries === state.entries) activate(current, first + y - area.y);
    } else if (action === "click" && contains(measureElement(cancel.current))) {
      close();
    }
  });

  if (!visible) return null;

  return (
    <Box
      position="absolute"
      left={Math.floor((columns - width) / 2)}
      top={Math.floor((panelHeight - height) / 2)}
      width={width}
      height={height}
      flexDirection="column"
      borderStyle="round"
      backgroundColor="black"
      paddingX={1}
    >
      <Text bold color="white">Load {serialization === "json" ? "JSON" : "Protobuf"} payload</Text>
      <Text color="white" wrap="truncate-middle">{displayText(state.directory)}</Text>
      <Box ref={list} height={listRows} flexShrink={0} flexDirection="column">
        {state.entries.slice(first, first + listRows).map(({ name, kind }, index) => {
          const selected = !state.cancelFocused && first + index === state.selected;
          return (
            <Text key={name} color="white" wrap="truncate-end" inverse={selected}>
              {selected ? "> " : "  "}{displayText(name)}{kind === "folder" ? "/" : ""}
            </Text>
          );
        })}
      </Box>
      <Text color="white" wrap="truncate-end">{state.error ?? " "}</Text>
      <Box ref={cancel} alignSelf="flex-end">
        <Text color="white">{state.cancelFocused ? "> " : "  "}[Cancel]</Text>
      </Box>
    </Box>
  );
}
