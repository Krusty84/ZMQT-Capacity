/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const cli = fileURLToPath(new URL("../../dist/cli/main.js", import.meta.url));
const reference = ["300", "1", "KiB", "20", "second", "python", "java", "json"];

function runCli(answers: string[], args: string[] = []) {
  return spawnSync(process.execPath, [cli, ...args], {
    input: answers.join("\n"),
    encoding: "utf8",
    timeout: 3000,
  });
}

test("prints the reference report to stdout and prompts to stderr", () => {
  const result = runCli(reference);
  expect(result.status).toBe(0);
  expect(result.stderr).toContain("Publisher count");
  expect(result.stderr).not.toContain("Preliminary ZeroMQ estimate");
  expect(result.stdout).not.toContain("Publisher count");

  const report = result.stdout.replace(/[\u00a0\u202f]/g, " ");
  expect(report).toContain("Total message rate — 6 000 msg/s");
  expect(report).toContain(
    "Payload traffic — 6 144 000 B/s, 6.144 MB/s, 49.152 Mbps",
  );
  expect(report).toContain("CPU, % of one core — 11.4 / 22.8 / 68.4");
  expect(report).toContain(
    "RAM for the buffer window, MiB — 281.34 / 482.57 / 683.79",
  );
  expect(report).toContain("RAM at HWM, MiB — 604.34 / 859.40 / 1 114.45");
  expect(report).toContain(
    "Queue per connection — 20 msg in 1 s, 1 000 at HWM",
  );
  expect(report).toContain("Throughput of one handler");
  expect(report).toContain("Unserved messages in 1 s — 0");
  expect(report).toContain("Model 1.0, profiles 1.0.0");
  expect(report).toContain("UNVALIDATED_COEFFICIENTS");
  expect(report).toContain("Assumptions");
});

test.each(["0,5", "0.5"])("accepts the decimal %s", (fraction) => {
  const result = runCli([
    "300",
    fraction,
    "kib",
    fraction,
    ...reference.slice(4),
  ]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("512 B, 0.5 msg/s per publisher");
  expect(result.stdout).toContain("Total message rate — 150 msg/s");
});

test("accepts a zero frequency", () => {
  const result = runCli([...reference.slice(0, 3), "0", ...reference.slice(4)]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Total message rate — 0 msg/s");
  expect(result.stdout).toContain("CPU, % of one core — 0 / 0 / 0");
});

test("repeats the prompt after an empty value, a malformed number or an invalid choice", () => {
  const result = runCli([
    "",
    "30abc",
    ...reference.slice(0, 2),
    "KB",
    ...reference.slice(2),
  ]);
  expect(result.status).toBe(0);
  expect(result.stderr.match(/Publisher count/g)).toHaveLength(3);
  expect(result.stderr.match(/Size unit/g)).toHaveLength(2);
  expect(result.stderr.match(/Enter a valid value/g)).toHaveLength(3);
});

test("retries the size and its unit after the model rejects a fractional byte size", () => {
  const result = runCli([
    "300",
    "0,5",
    "B",
    ...reference.slice(3),
    "0,5",
    "KiB",
  ]);
  expect(result.status).toBe(0);
  expect(result.stderr).toContain("whole number of bytes");
  expect(result.stderr.match(/Serialized message size/g)).toHaveLength(2);
  expect(result.stderr.match(/Size unit/g)).toHaveLength(2);
  expect(result.stderr.match(/Serialization format/g)).toHaveLength(1);
  expect(result.stdout).toContain("512 B, 20 msg/s per publisher");
});

test("retries the frequency and its period when normalization overflows", () => {
  const result = runCli([
    ...reference.slice(0, 3),
    "1e308",
    "millisecond",
    ...reference.slice(5),
    "20",
    "second",
  ]);
  expect(result.status).toBe(0);
  expect(result.stderr).toContain(
    "The converted frequency is outside the allowed range",
  );
  expect(
    result.stderr.match(/Messages from one publisher per period/g),
  ).toHaveLength(2);
  expect(result.stderr.match(/Period — minute/g)).toHaveLength(2);
  expect(result.stdout).toContain("6.144 MB/s");
});

test("prints help without prompting", () => {
  const result = runCli([], ["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("zmqt-capacity --help");
  expect(result.stderr).toBe("");
});

test("rejects unknown arguments", () => {
  const result = runCli([], ["--json"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Unknown argument");
});

test("reports incomplete input without printing a report", () => {
  const result = runCli(["300"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Input ended before the calculation");
});

test("reports a calculation error when the combined rate overflows", () => {
  const result = runCli([
    ...reference.slice(0, 3),
    "1e308",
    ...reference.slice(4),
  ]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(
    "Calculation error (NUMERIC_RANGE, totalMessagesPerSecond)",
  );
});

test.skipIf(process.platform === "win32")(
  "cancels a pending prompt on SIGINT",
  async () => {
    const child = spawn(process.execPath, [cli]);
    let report = "";
    let messages = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      report += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      messages += chunk;
    });
    child.stderr.once("data", () => child.kill("SIGINT"));

    try {
      const [code, signal] = await once(child, "close", {
        signal: AbortSignal.timeout(3000),
      });
      expect(code).toBe(130);
      expect(signal).toBeNull();
      expect(report).toBe("");
      expect(messages).toContain("Calculation canceled");
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
  },
);
