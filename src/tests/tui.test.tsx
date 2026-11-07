/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { spawnSync } from "node:child_process";
import process from "node:process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { render } from "ink";
import { expect, test, vi } from "vitest";
import { App } from "../tui/app.js";

const bin = fileURLToPath(new URL("../../dist/tui/main.js", import.meta.url));

function run(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    input: "300\n1\nKiB\n20\nsecond\npython\njava\njson\n",
    timeout: 3000,
  });
}

test("rejects piped input with a terminal requirement", () => {
  const result = run();
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("An interactive terminal is required.\n");
});

test("shows help without a terminal and rejects old mode arguments", () => {
  const help = run("--help");
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("zmqt-capacity --help");
  expect(help.stderr).toBe("");

  const invalid = run("--cli");
  expect(invalid.status).toBe(2);
  expect(invalid.stderr).toContain("Unknown argument.");
});

function renderTui() {
  const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() });
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80, rows: 24 });
  let frame = "";
  let output = "";
  stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    const stripped = stripVTControlCharacters(text);
    if (stripped.includes("System parameters") || stripped.includes("Enlarge the terminal")) {
      frame = stripped;
    }
  });
  const app = render(<App />, {
    stdin,
    stdout,
    debug: true,
    interactive: true,
    exitOnCtrlC: false,
    kittyKeyboard: { mode: "disabled" },
  });

  return {
    app,
    stdin,
    get frame() { return frame; },
    get output() { return output; },
    waitFor(text: string) {
      return vi.waitFor(() => expect(frame).toContain(text));
    },
    mouseAt(text: string, button = 0, offset = 0) {
      const lines = frame.split("\n");
      const row = lines.findIndex((line) => line.includes(text));
      expect(row).toBeGreaterThanOrEqual(0);
      const column = lines[row].indexOf(text) + offset;
      return `\x1b[<${button};${column + 1};${row + 1}M`;
    },
    resize(columns: number, rows = stdout.rows) {
      stdout.columns = columns;
      stdout.rows = rows;
      stdout.emit("resize");
    },
    async close() {
      app.unmount();
      await app.waitUntilExit();
      stdin.destroy();
      stdout.destroy();
    },
  };
}

test("updates the summary from keyboard edits, unit choices and resize", async () => {
  const tui = renderTui();
  try {
    await tui.waitFor("6.144 MB/s");
    expect(tui.frame).toMatch(/System parameters[^\n]*Estimated results/);
    expect(tui.frame.split("\n")[2]).toMatch(/│ +│$/);
    expect(tui.frame).toContain("6,000 msg/s");
    expect(tui.frame).toContain("11.4–68.4%");
    expect(tui.frame).toContain("604–1,114 MiB");

    tui.stdin.write("\x1b[B\x7f"); // Down to Message size and erase its value.
    await tui.waitFor("Expected a positive finite number.");
    expect(tui.frame).not.toContain("6,000 msg/s");

    tui.stdin.write("\x1b[200~0,5\x1b[201~");
    await tui.waitFor("3.072 MB/s");

    tui.stdin.write("\t\r\x1b[A"); // Open Size unit and highlight B.
    await tui.waitFor("> B");
    tui.stdin.write("\x1b");
    await tui.waitFor("> KiB ▾");
    expect(tui.frame).toContain("3.072 MB/s");

    tui.stdin.write("\r\x1b[A\r");
    await tui.waitFor("Size must convert to a whole number");
    tui.stdin.write("\r\x1b[B\r");
    await tui.waitFor("3.072 MB/s");

    tui.resize(79);
    await tui.waitFor("Enlarge the terminal");
    tui.resize(80);
    await tui.waitFor("3.072 MB/s");
  } finally {
    await tui.close();
  }
});

test("uses mouse coordinates for editing, selection and report scrolling", async () => {
  const tui = renderTui();
  try {
    await tui.waitFor("6.144 MB/s");
    expect(tui.output).toContain("\x1b[?1006h\x1b[?1000h");

    const click = tui.mouseAt("300", 0, 1);
    tui.stdin.write(click.slice(0, 6));
    await new Promise<void>((resolve) => setImmediate(resolve));
    tui.stdin.write(click.slice(6) + "1");
    await tui.waitFor("62,000 msg/s");

    tui.stdin.write(tui.mouseAt("Size unit"));
    await tui.waitFor("> KiB ▴");
    tui.stdin.write(tui.mouseAt(" B ", 0, 1));
    await tui.waitFor("> B ▾");

    tui.stdin.write(tui.mouseAt("C++ — libzmq / cppzmq"));
    await tui.waitFor("One publisher — C++");
    tui.stdin.write(tui.mouseAt("[Details]"));
    await tui.waitFor("Preliminary ZeroMQ estimate");
    expect(tui.frame).toMatch(/System parameters[^\n]*Estimated results/);

    tui.stdin.write(tui.mouseAt("Preliminary ZeroMQ estimate", 65));
    await vi.waitFor(() => expect(tui.frame).not.toContain("Preliminary ZeroMQ estimate"));
    tui.stdin.write("\x1b[5~");
    await tui.waitFor("Preliminary ZeroMQ estimate");
    tui.stdin.write(tui.mouseAt("[Summary]"));
    await tui.waitFor("[Details]");

    tui.stdin.write("\x03");
    expect(await tui.app.waitUntilExit()).toBe(130);
    expect(tui.output).toContain("\x1b[?1000l\x1b[?1006l");
    expect(tui.stdin.setRawMode).toHaveBeenLastCalledWith(false);
  } finally {
    await tui.close();
  }
});

function expectAboutCentered(frame: string, columns: number, rows: number) {
  const left = Math.floor((columns - 48) / 2);
  const top = Math.floor((rows - 2 - 8) / 2);
  const lines = frame.split("\n");
  const border = "─".repeat(46);
  expect(lines[top]?.slice(left, left + 48)).toBe(`╭${border}╮`);
  expect(lines[top + 2]?.slice(left, left + 48)).toBe(`│${" ".repeat(46)}│`);
  expect(lines[top + 7]?.slice(left, left + 48)).toBe(`╰${border}╯`);
}

test("centers the About dialog and isolates its input", async () => {
  const tui = renderTui();
  try {
    await tui.waitFor("6.144 MB/s");
    expect(tui.frame.split("\n")[22]).toMatch(/Ctrl\+C Exit\s+\[About\]$/);
    expect(tui.frame.split("\n")[22]).toHaveLength(80);
    tui.stdin.write("\x1b[A");
    await tui.waitFor("> [About]");

    tui.stdin.write(tui.mouseAt("[Details]"));
    await tui.waitFor("Preliminary ZeroMQ estimate");
    tui.stdin.write("\x1b[6~");
    await vi.waitFor(() => expect(tui.frame).not.toContain("Preliminary ZeroMQ estimate"));
    const previousBody = tui.frame.split("\n").slice(2, 22);

    tui.stdin.write("\t\r");
    await tui.waitFor("> [Close]");
    expectAboutCentered(tui.frame, 80, 24);
    expect(tui.frame).toMatch(/ZMQT-Capacity \d+\.\d+\.\d+/);
    expect(tui.frame).toContain("License MIT");
    expect(tui.frame).toContain("https://github.com/Krusty84/ZMQT-Capacity");

    tui.stdin.write(tui.mouseAt("Publisher count") + "\t\x1b[B123\x1b[200~456\x1b[201~");
    tui.stdin.write("\x1b[5~\x1b[<64;77;4M");
    tui.resize(100, 31);
    await vi.waitFor(() => expectAboutCentered(tui.frame, 100, 31));
    tui.resize(79, 23);
    await tui.waitFor("Enlarge the terminal");
    tui.resize(80, 24);
    await vi.waitFor(() => expectAboutCentered(tui.frame, 80, 24));

    tui.stdin.write("\x1b");
    await tui.waitFor("> [About]");
    expect(tui.frame).toContain("[Summary]");
    expect(tui.frame.split("\n").slice(2, 22)).toEqual(previousBody);

    tui.stdin.write(tui.mouseAt("[About]"));
    await tui.waitFor("> [Close]");
    tui.stdin.write(tui.mouseAt("[Close]"));
    await tui.waitFor("> [About]");

    tui.stdin.write(" ");
    await tui.waitFor("> [Close]");
    tui.stdin.write("\r");
    await tui.waitFor("> [About]");
  } finally {
    await tui.close();
  }
});
