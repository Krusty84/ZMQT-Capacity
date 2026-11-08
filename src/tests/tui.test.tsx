/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { spawnSync } from "node:child_process";
import process from "node:process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { render, renderToString } from "ink";
import { expect, test, vi } from "vitest";
import { App } from "../tui/app.js";
import { SummaryReport } from "../tui/report.js";
import { calculate } from "./fixtures.js";

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
    if (stripped.includes("Initial values") || stripped.includes("Enlarge the terminal")) {
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
    await tui.waitFor("38 µs");
    expect(tui.frame.split("\n")[0]).toMatch(/^╭─{35}╮ ╭─{40}╮$/);
    expect(tui.frame).toContain("Java — Spring Boot + JeroMQ");
    expect(tui.frame).toMatch(/Initial values[^\n]*Estimated results {3}\[Explanations\]/);
    expect(tui.frame.split("\n")[2]).toMatch(/│ +│$/);
    expect(tui.frame).toMatch(/Send frequency[^\n]*\n[^\n]*\n│ Message format/);
    expect(tui.frame).toMatch(/Publisher language[^\n]*\n[^\n]*\n[^\n]*\n│ +│[^\n]*\n│ Subscriber language/);
    expect(tui.frame).toMatch(/│Metric +│ *Estimate│/);
    expect(tui.frame).toMatch(/│CPU time per message +│ +38 µs│/);

    tui.stdin.write("\x1b[B\x7f"); // Down to Message size and erase its value.
    await tui.waitFor("Expected a positive finite number.");
    expect(tui.frame).not.toContain("38 µs");
    await vi.waitFor(() => expect(tui.frame).not.toMatch(/[█░]/));

    tui.stdin.write("\x1b[200~0,5\x1b[201~");
    await tui.waitFor("29 µs");

    tui.stdin.write("\t\r\x1b[A"); // Open Size unit and highlight B.
    await tui.waitFor("> B");
    expect(tui.frame.split("\n")[20]).toContain("C++ — libzmq / cppzmq");
    tui.stdin.write("\x1b");
    await tui.waitFor("> KiB ▾");
    expect(tui.frame).toContain("29 µs");

    tui.stdin.write("\r\x1b[A\r");
    await tui.waitFor("Size must convert to a whole number");
    tui.stdin.write("\r\x1b[B\r");
    await tui.waitFor("29 µs");
    tui.stdin.write("\t\x1b[B\x1b[B");
    await tui.waitFor("> (o) JSON");

    tui.resize(79);
    await tui.waitFor("Enlarge the terminal");
    tui.resize(80);
    await tui.waitFor("29 µs");
  } finally {
    await tui.close();
  }
});

test("uses mouse coordinates for editing, selection and report scrolling", async () => {
  const tui = renderTui();
  try {
    await tui.waitFor("38 µs");
    expect(tui.output).toContain("\x1b[?1006h\x1b[?1000h");

    const click = tui.mouseAt("300", 0, 1);
    tui.stdin.write(click.slice(0, 6));
    await new Promise<void>((resolve) => setImmediate(resolve));
    tui.stdin.write(click.slice(6) + "1");
    await tui.waitFor("2.356│");

    tui.stdin.write(tui.mouseAt("Size unit"));
    await tui.waitFor("> KiB ▴");
    tui.stdin.write(tui.mouseAt(" B ", 0, 1));
    await tui.waitFor("> B ▾");

    tui.stdin.write(tui.mouseAt("C++ — libzmq / cppzmq"));
    await tui.waitFor("> (o) C++ — libzmq / cppzmq");
    tui.stdin.write("\x1b[6~".repeat(3));
    await tui.waitFor("One publisher — C++");
    tui.stdin.write(tui.mouseAt("[Explanations]"));
    await tui.waitFor("Preliminary ZeroMQ estimate");
    expect(tui.frame).toContain("Estimated results > [Summary]");
    expect(tui.frame).toContain("Model 1.0, profiles 1.0.0");
    expect(tui.frame).toContain("Warnings");
    expect(tui.frame).not.toMatch(/┌|Input —/);
    expect(tui.frame.split("\n")[3]).toMatch(/█│$/);
    const explanations = tui.frame.split("\n")
      .map((line) => line.split("│").at(-2)?.replace(/[█░]$/, "").trim())
      .join(" ");
    expect(explanations).toContain("0.5 for Low, 1 for Nominal, and 3 for High.");
    expect(explanations).toContain("RAM adds base, connection, and queue memory using Low or High profile values.");
    expect(explanations).toContain("Nominal = (Low + High) / 2.");

    tui.stdin.write(tui.mouseAt("Preliminary ZeroMQ estimate", 65));
    await vi.waitFor(() => expect(tui.frame).not.toContain("Preliminary ZeroMQ estimate"));
    tui.stdin.write("\x1b[5~");
    await tui.waitFor("Preliminary ZeroMQ estimate");

    tui.stdin.write("\x1b[6~".repeat(2));
    await tui.waitFor("Assumptions");
    tui.stdin.write("\x1b[<0;79;21M"); // Click the end of the 80×24 scrollbar.
    await tui.waitFor("hard real-time use.");
    expect(tui.frame.split("\n")[20]).toMatch(/█│$/);
    tui.stdin.write("\r");
    await tui.waitFor("20.017578 µs");
    expect(tui.frame).toContain("> [Explanations]");
    expect(tui.frame.split("\n")[3]).toMatch(/█│$/);

    tui.stdin.write("\x03");
    expect(await tui.app.waitUntilExit()).toBe(130);
    expect(tui.output).toContain("\x1b[?1000l\x1b[?1006l");
    expect(tui.stdin.setRawMode).toHaveBeenLastCalledWith(false);
  } finally {
    await tui.close();
  }
});

test("moves and hides the vertical scrollbar with the report", async () => {
  const tui = renderTui();
  const track = (height: number) => tui.frame.split("\n").slice(3, 3 + height)
    .map((line) => line.at(-2)).join("");
  try {
    await vi.waitFor(() => expect(track(18)).toMatch(/^█{5}░{13}$/));
    expect(tui.frame.split("\n")[4].slice(40)).toMatch(/^┌─{27}┬─{8}┐█│$/);

    // The 80×24 track is in column 79 and spans rows 4 through 21.
    tui.stdin.write("\x1b[<0;79;12M");
    await vi.waitFor(() => expect(track(18)).toMatch(/^░{6}█{5}░{7}$/));
    expect(tui.frame).toContain("│Handler limit");

    tui.stdin.write("\x1b[<65;79;12M");
    await vi.waitFor(() => expect(track(18)).toMatch(/^░{7}█{5}░{6}$/));
    tui.stdin.write("\x1b[5~");
    await vi.waitFor(() => expect(track(18)).toMatch(/^░{2}█{5}░{11}$/));
    tui.stdin.write("\x1b[6~");
    await vi.waitFor(() => expect(track(18)).toMatch(/^░{7}█{5}░{6}$/));

    tui.stdin.write("\x1b[<0;79;21M");
    await tui.waitFor("Input — 300 publisher(s)");
    expect(track(18)).toMatch(/^░{13}█{5}$/);

    tui.resize(100, 31);
    await vi.waitFor(() => expect(track(25)).toMatch(/^░{15}█{10}$/));
    tui.stdin.write("\x1b[<0;99;4M");
    await tui.waitFor("│RAM for a 1 s buffer window, MiB│");
    expect(track(25)).toMatch(/^█{10}░{15}$/);

    tui.resize(100, 66);
    await tui.waitFor("Input — 300 publisher(s)");
    expect(track(60)).toMatch(/^ {60}$/);
  } finally {
    await tui.close();
  }
});

test("adapts the scenario tables to the terminal and scrolls through the report", async () => {
  const tui = renderTui();
  const compactCores = /│CPU, cores +│ +0\.114│ +0\.228│ +0\.684│/;
  try {
    await tui.waitFor("38 µs");
    expect(tui.frame).toMatch(compactCores);

    tui.resize(100, 31);
    await tui.waitFor("CPU load in logical cores");
    tui.resize(90, 24);
    await vi.waitFor(() => expect(tui.frame).toMatch(compactCores));
    tui.resize(80, 24);
    await vi.waitFor(() => expect(tui.frame.split("\n")[0]).toMatch(/^╭─{35}╮ ╭─{40}╮$/));

    tui.stdin.write("\x1b[6~");
    await tui.waitFor("Subscriber capacity");
    expect(tui.frame).toContain("One publisher — Python");
    tui.stdin.write("\x1b[6~");
    await vi.waitFor(() => expect(tui.frame).toMatch(/│CPU, cores +│0\.0005│ +0\.001│ +0\.003│/));

    tui.stdin.write("\x1b[6~");
    await tui.waitFor("Input — 300 publisher(s)");
    expect(tui.frame).toMatch(/│6,000 +│ +6\.144│ +49\.152│/);

    tui.resize(100, 31);
    await vi.waitFor(() => expect(tui.frame.split("\n")[0]).toMatch(/^╭─{35}╮ ╭─{60}╮$/));
    expect(tui.frame).toMatch(/│6,000 +│ +6\.144│ +49\.152│/);

    tui.stdin.write("1");
    await tui.waitFor("2.28076│");
    expect(tui.frame).toContain("Subscriber — Java");
    expect(tui.frame).toMatch(/│CPU, cores +│ *1\.14038│ *2\.28076│ *6\.84228│/);
    expect(tui.frame).toContain("│CPU, % core");
    expect(tui.frame).toContain("│RAM 1 s, MiB");
    expect(tui.frame).toContain("│RAM HWM, MiB");
    expect(tui.frame.split("\n")[3]).toMatch(/█│$/);
  } finally {
    await tui.close();
  }
});

test("shows the full estimate once in bordered tables at three widths", () => {
  const result = calculate();
  for (const width of [38, 48, 58]) {
    const report = stripVTControlCharacters(renderToString(
      <SummaryReport result={result} width={width} />,
      { columns: width },
    ));
    expect(report.match(/^(Subscriber — Java|Subscriber capacity|One publisher — Python|Traffic)$/gm))
      .toEqual(["Subscriber — Java", "Subscriber capacity", "One publisher — Python", "Traffic"]);
    expect(report.match(/^├[─┼]+┤$/gm)).toHaveLength(16);
    expect(report).not.toMatch(/^│[^\n]*\n│/m);
    const metricLabels = report.split("\nTraffic\n")[0].split("\n")
      .filter((line) => line.startsWith("│"))
      .map((line) => line.split("│")[1].trim())
      .filter((label) => label !== "Metric");
    const processLabels = width === 58
      ? [
        "CPU load in logical cores",
        "CPU load, % of one logical core",
        "RAM for a 1 s buffer window, MiB",
        "RAM with queues at HWM, MiB",
      ]
      : ["CPU, cores", "CPU, % core", "RAM 1 s, MiB", "RAM HWM, MiB"];
    const capacityLabels = width === 58
      ? [
        "Subscriber connections",
        "Queued messages per connection",
        "Messages per connection at HWM",
        "Throughput of one handler",
        "Unserved messages in 1 s",
      ]
      : ["Connections", "Queue per peer", "Queue at HWM", "Handler limit", "Unserved in 1 s"];
    expect(metricLabels).toEqual([
      "CPU time per message", ...processLabels, ...capacityLabels, "CPU time per message", ...processLabels,
    ]);
    expect(report).toMatch(/\nTraffic\n┌─+┬─+┬─+┐\n│msg\/s +│ +MB\/s│ +Mbps│\n├─+┼─+┼─+┤\n│6,000 +│ +6\.144│ +49\.152│\n└─+┴─+┴─+┘/);
    expect(report).not.toMatch(/\bB\/s\b/);
    expect(report.match(/│Metric +│ +Low│Nominal│ +High│/g)).toHaveLength(2);
    expect(report).toMatch(/│ *30\.05│ *65\.12│100\.19│/);
    expect(report).toMatch(/│604\.34│ *859\.40│1,114\.45│/);
    for (const value of ["50 µs", "38 µs", "20 msg in 1 s", "1,000 msg/peer", "26,315.789474 msg/s"]) {
      expect(report.split(value)).toHaveLength(2);
    }
    expect(report.slice(report.lastIndexOf("┘") + 1).replace(/\s+/g, " ").trim())
      .toBe("Input — 300 publisher(s), 1,024 B, 20 msg/s per publisher, json");
  }
});

test("preserves long traffic values within their columns", () => {
  const result = calculate({
    publisherCount: 1,
    messageSize: 1_000_000,
    messageFrequency: 12_345_678.123456,
  });
  for (const [width, lineCount] of [[38, 2], [58, 1]]) {
    const report = stripVTControlCharacters(renderToString(
      <SummaryReport result={result} width={width} />,
      { columns: width },
    ));
    const traffic = report.split("\nTraffic\n")[1];
    const lines = traffic.split("\n").filter((line) => line.startsWith("│")).slice(1);
    expect(lines).toHaveLength(lineCount);
    expect(lines.every((line) => line.length === width)).toBe(true);
    const cells = lines.map((line) => line.split("│"));
    expect([1, 2, 3].map((column) => cells.map((row) => row[column].trim()).join("")))
      .toEqual(["12,345,678.123456", "12,345,678.123456", "98,765,424.987648"]);
  }
});

test("preserves long numbers when the scenario columns no longer fit", () => {
  const result = calculate({
    publisherCount: Number.MAX_SAFE_INTEGER,
    messageSize: Number.MAX_SAFE_INTEGER,
    messageFrequency: 0,
  });
  const highRam = result.subscriber.ramFullMiBHigh.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  for (const width of [38, 58]) {
    const report = stripVTControlCharacters(renderToString(
      <SummaryReport result={result} width={width} />,
      { columns: width },
    ));
    expect(report).toMatch(/│Scenario +│ +Estimate│/);
    expect(report).not.toMatch(/│Metric +│ *Low│ *Nominal│ *High│/);
    expect(report).toContain("\nRAM for a 1 s buffer window, MiB\n");
    expect(report.replace(/[\s│]/g, "")).toContain(highRam);
    expect(report.split("\n").every((line) => line.length <= width)).toBe(true);
  }
});

function expectAboutCentered(frame: string, columns: number, rows: number) {
  const width = 64;
  const left = Math.floor((columns - width) / 2);
  const height = 12;
  const top = Math.floor((rows - 2 - height) / 2);
  const lines = frame.split("\n");
  const border = "─".repeat(width - 2);
  expect(lines[top]?.slice(left, left + width)).toBe(`╭${border}╮`);
  expect(lines[top + 2]?.slice(left, left + width)).toBe(`│${" ".repeat(width - 2)}│`);
  expect(lines[top + height - 1]?.slice(left, left + width)).toBe(`╰${border}╯`);
}

test("centers the About dialog and isolates its input", async () => {
  const tui = renderTui();
  try {
    await tui.waitFor("38 µs");
    expect(tui.frame.split("\n")[22]).toMatch(/Ctrl\+C Exit\s+\[About\]$/);
    expect(tui.frame.split("\n")[22]).toHaveLength(80);
    tui.stdin.write("\x1b[A");
    await tui.waitFor("> [About]");

    tui.stdin.write(tui.mouseAt("[Explanations]"));
    await tui.waitFor("Preliminary ZeroMQ estimate");
    tui.stdin.write("\x1b[6~");
    await vi.waitFor(() => expect(tui.frame).not.toContain("Preliminary ZeroMQ estimate"));
    const previousBody = tui.frame.split("\n").slice(2, 22);

    tui.stdin.write("\t\r");
    await tui.waitFor("> [Close]");
    expectAboutCentered(tui.frame, 80, 24);
    expect(tui.frame).toMatch(/ZMQT-Capacity \d+\.\d+\.\d+/);
    expect(tui.frame).toContain("License MIT");
    expect(tui.frame).toContain("Author: Alexey Sedoykin");
    expect(tui.frame).not.toContain("https://github.com/Krusty84/ZMQT-Capacity");
    expect(tui.frame).toContain("Contact|Support:");
    expect(tui.frame).toContain("https://www.linkedin.com/in/sedoykin");
    expect(tui.frame).toContain("https://github.com/Krusty84");
    expect(tui.output).toContain("\x1b]8;;https://www.linkedin.com/in/sedoykin\x1b\\");
    expect(tui.output).toContain("\x1b]8;;https://github.com/Krusty84\x1b\\");
    expect(tui.frame).toContain("Warning: Estimates are approximate and for guidance only.");

    tui.stdin.write(tui.mouseAt("Publisher count") + "\t\x1b[B123\x1b[200~456\x1b[201~");
    tui.stdin.write("\x1b[5~\x1b[<64;77;4M\x1b[<0;79;21M");
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
