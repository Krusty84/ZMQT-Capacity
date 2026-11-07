#!/usr/bin/env node
/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import process from "node:process";
import { render } from "ink";
import { App } from "./app.js";

const usage = `Usage
  zmqt-capacity
  npm start
  zmqt-capacity --help   Show help

The calculator opens in an interactive terminal.`;

async function main(args: string[]): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  if (args.length > 0) {
    process.stderr.write(`Unknown argument.\n${usage}\n`);
    return 2;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("An interactive terminal is required.\n");
    return 2;
  }

  const app = render(<App />, {
    interactive: true,
    alternateScreen: true,
    exitOnCtrlC: false,
  });
  return (await app.waitUntilExit()) === 130 ? 130 : 0;
}

process.exitCode = await main(process.argv.slice(2));
