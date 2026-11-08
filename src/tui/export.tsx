/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { closeSync, openSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { stripVTControlCharacters } from "node:util";
import { Box, measureElement, renderToString, Text, useInput, usePaste, type DOMElement, type Key } from "ink";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import type { CapacityEstimate } from "../models/result.js";
import { displayText, errorReason, readDirectory } from "./files.js";
import type { MouseEvent } from "./mouse.js";
import { ExplanationsReport, SummaryReport } from "./report.js";

export interface ReportExport {
  defaultName: string;
  initialValues: string;
  result: CapacityEstimate;
}

function saveReport(path: string, { initialValues, result }: ReportExport) {
  const columns = 100;
  const content = stripVTControlCharacters([
    `Report time ${new Date().toLocaleString()}`,
    `Initial Values\n${initialValues}`,
    `Estimated results\n${renderToString(<SummaryReport result={result} width={columns} />, { columns })}`,
    `===\nExplanations\n${renderToString(<ExplanationsReport metadata={result.metadata} />, { columns })}`,
  ].join("\n\n") + "\n");

  const file = openSync(path, "wx");
  try {
    try {
      writeFileSync(file, content, "utf8");
    } finally {
      closeSync(file);
    }
  } catch (error) {
    rmSync(path, { force: true });
    throw error;
  }
}

const width = 64;
const folderRows = 6;
const height = folderRows + 9;
const focusOrder = ["folders", "filename", "cancel", "ok"] as const;
type Focus = (typeof focusOrder)[number];

interface DialogState {
  directory: string;
  folders: string[];
  selected: number;
  focus: Focus;
  filename: string;
  cursor: number;
  error?: string;
}

function openFolder(directory: string) {
  const { entries, error } = readDirectory(directory, "folders");
  return { directory, folders: entries.map(({ name }) => name), selected: 0, error };
}

function moveSelection(state: DialogState, offset: number): DialogState {
  const selected = Math.max(0, Math.min(state.selected + offset, state.folders.length - 1));
  return { ...state, selected };
}

function editFilename(state: DialogState, input: string, key?: Key): DialogState {
  const chars = Array.from(state.filename);
  const { cursor } = state;
  if (key?.leftArrow) return { ...state, cursor: Math.max(0, cursor - 1) };
  if (key?.rightArrow) return { ...state, cursor: Math.min(chars.length, cursor + 1) };
  if (key?.home) return { ...state, cursor: 0 };
  if (key?.end) return { ...state, cursor: chars.length };

  let start = cursor;
  let end = cursor;
  if (key?.backspace || input === "\x7f" || input === "\b") {
    start = Math.max(0, cursor - 1);
    input = "";
  } else if (key?.delete) {
    end = Math.min(chars.length, cursor + 1);
    input = "";
  } else if (!input || /\p{Cc}/u.test(input)) {
    return state;
  }
  const filename = chars.slice(0, start).join("") + input + chars.slice(end).join("");
  return { ...state, filename, cursor: start + Array.from(input).length, error: undefined };
}

interface ExportDialogProps {
  report: ReportExport;
  columns: number;
  panelHeight: number;
  visible: boolean;
  mouseHandler: Ref<(event: MouseEvent) => void>;
  onClose: (saved: boolean) => void;
}

export function ExportDialog({ report, columns, panelHeight, visible, mouseHandler, onClose }: ExportDialogProps) {
  const [state, setState] = useState<DialogState>(() => ({
    ...openFolder(process.cwd()),
    focus: "folders",
    filename: report.defaultName,
    cursor: report.defaultName.length,
  }));
  // Several terminal input events can arrive before React commits the next frame.
  const latest = useRef<DialogState | undefined>(state);
  const targets = useRef(new Map<Focus, DOMElement>());
  const first = Math.max(0, state.selected - folderRows + 1);

  function update(next: DialogState) {
    latest.current = next;
    setState(next);
  }

  function close(saved: boolean) {
    latest.current = undefined;
    onClose(saved);
  }

  function activate(current: DialogState, folder = current.folders[current.selected]): DialogState | undefined {
    switch (current.focus) {
      case "folders":
        return folder ? { ...current, ...openFolder(join(current.directory, folder)) } : current;
      case "filename":
        return current;
      case "cancel":
        close(false);
        return;
      case "ok": {
        const { filename, directory } = current;
        if (!filename.trim() || filename === "." || filename === ".." || /[/\\\p{Cc}]/u.test(filename) ||
            (process.platform === "win32" && /[<>:"|?*]|[. ]$/.test(filename))) {
          return { ...current, focus: "filename", error: "Enter a valid file name." };
        }
        try {
          saveReport(join(directory, filename), report);
        } catch (error) {
          const reason = errorReason(error);
          return { ...current, error: reason === "EEXIST"
            ? "File already exists. Change the file name."
            : `Cannot save report (${reason}).` };
        }
        close(true);
        return;
      }
    }
  }

  function handleKey(current: DialogState, input: string, key: Key): DialogState | undefined {
    if (key.tab || input === "\t") {
      const index = focusOrder.indexOf(current.focus) + (key.shift ? -1 : 1);
      return { ...current, focus: focusOrder[(index + focusOrder.length) % focusOrder.length] };
    }
    if (current.focus === "folders" && (key.upArrow || key.downArrow)) {
      return moveSelection(current, key.upArrow ? -1 : 1);
    }
    if (key.return || input === "\r" || (input === " " && current.focus !== "filename")) {
      return activate(current);
    }
    return current.focus === "filename" ? editFilename(current, input, key) : current;
  }

  useInput((input, key) => {
    if (key.eventType === "release" || key.ctrl || key.meta || key.super || key.hyper) return;
    let next = latest.current;
    if (!next) return;
    if (key.escape) {
      close(false);
      return;
    }
    for (const part of input.length > 1 ? input.split(/([\t\r\x7f\x08])/).filter(Boolean) : [input]) {
      next = handleKey(next, part, key);
      if (!next) return;
    }
    update(next);
  }, { isActive: visible });
  usePaste((input) => {
    const current = latest.current;
    if (current?.focus === "filename" && !/\p{Cc}/u.test(input)) update(editFilename(current, input));
  }, { isActive: visible });

  useImperativeHandle(mouseHandler, () => ({ action, x, y }) => {
    const current = latest.current;
    if (!current) return;
    for (const [focus, node] of targets.current) {
      const area = measureElement(node);
      if (x < area.x || x >= area.x + area.width || y < area.y || y >= area.y + area.height) continue;
      const focused = { ...current, focus };
      if (action !== "click") {
        if (focus === "folders") update(moveSelection(focused, action === "scrollUp" ? -3 : 3));
        return;
      }
      const next = focus === "folders"
        ? activate(focused, state.folders[first + y - area.y] ?? "")
        : activate(focused);
      if (next) update(next);
      return;
    }
  });

  if (!visible) return null;

  function target(focus: Focus) {
    return (node: DOMElement | null) => {
      if (node) targets.current.set(focus, node);
      else targets.current.delete(focus);
    };
  }

  const marker = (focus: Focus) => state.focus === focus ? "> " : "  ";
  const chars = Array.from(state.filename);
  let start = state.cursor;
  let space = width - 7;
  // Leave room for the marker and caret, including double-width characters.
  while (start > 0 && space >= 2) {
    start--;
    space -= chars[start].length === 1 && chars[start].charCodeAt(0) < 128 ? 1 : 2;
  }

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
      <Text bold color="white">Export report</Text>
      <Text bold color="white">Folder</Text>
      <Text color="white" wrap="truncate-middle">{displayText(state.directory)}</Text>
      <Box ref={target("folders")} height={folderRows} flexShrink={0} flexDirection="column">
        {state.folders.slice(first, first + folderRows).map((folder, index) => (
          <Text key={folder} color="white" wrap="truncate-end" inverse={state.focus === "folders" && first + index === state.selected}>
            {first + index === state.selected ? marker("folders") : "  "}{displayText(folder)}
          </Text>
        ))}
      </Box>
      <Box ref={target("filename")} flexDirection="column">
        <Text bold color="white">File name</Text>
        <Text color="white" wrap="truncate-end">
          {marker("filename")}
          {chars.slice(start, state.cursor).join("")}
          <Text inverse={state.focus === "filename"}>{chars[state.cursor] ?? " "}</Text>
          {chars.slice(state.cursor + 1).join("")}
        </Text>
      </Box>
      <Text color="white" wrap="truncate-end">{state.error ?? " "}</Text>
      <Box alignSelf="flex-end" gap={1}>
        <Box ref={target("cancel")}><Text color="white">{marker("cancel")}[Cancel]</Text></Box>
        <Box ref={target("ok")}><Text color="white">{marker("ok")}[Ok]</Text></Box>
      </Box>
    </Box>
  );
}
