/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

#!/usr/bin/env node
import process from "node:process";
import { createInterface } from "node:readline";
import { estimateCapacity } from "../index.js";
import {
  frequencyUnits,
  messageSizeUnits,
  publisherLanguages,
  serializations,
  subscriberLanguages,
  type CapacityInput,
} from "../models/input.js";
import { formatReport } from "./report.js";

const usage = `Usage
  zmqt-capacity
  npm run cli

The wizard prompts for parameters and runs one calculation.
Enter one value per line. Use a dot or comma as the decimal separator.
  zmqt-capacity --help   Show help`;

interface Question<T> {
  prompt: string;
  parse: (answer: string) => T | undefined;
}

function choice<T extends string>(prompt: string, options: readonly T[]): Question<T> {
  return {
    prompt: `${prompt} (${options.join(" / ")})`,
    parse: (answer) => options.find((option) => option.toLowerCase() === answer.toLowerCase()),
  };
}

function parseDecimal(answer: string): number | undefined {
  const match = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))(?:e[+-]?\d+)?$/i.exec(answer);
  if (!match) return undefined;

  const value = Number(answer.replace(",", "."));
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(match[1]))) return undefined;
  return value;
}

const questions = {
  publisherCount: {
    prompt: "Publisher count (integer, 1 or more)",
    parse(answer) {
      const value = Number(answer);
      return /^\d+$/.test(answer) && Number.isSafeInteger(value) && value > 0 ? value : undefined;
    },
  },
  messageSize: {
    prompt: "Serialized message size (greater than 0)",
    parse(answer) {
      const value = parseDecimal(answer);
      return value !== undefined && value > 0 ? value : undefined;
    },
  },
  messageSizeUnit: choice("Size unit", messageSizeUnits),
  messageFrequency: {
    prompt: "Messages from one publisher per period (0 or more)",
    parse(answer) {
      const value = parseDecimal(answer);
      return value !== undefined && value >= 0 ? value : undefined;
    },
  },
  frequencyUnit: choice("Period — minute, second, or millisecond", frequencyUnits),
  publisherLanguage: choice("Publisher language", publisherLanguages),
  subscriberLanguage: choice("Subscriber language", subscriberLanguages),
  serialization: choice("Serialization format", serializations),
} satisfies { [Field in keyof CapacityInput]: Question<CapacityInput[Field]> };

async function runWizard(): Promise<number> {
  const { stdin, stdout, stderr } = process;
  const terminal = Boolean(stdin.isTTY && stderr.isTTY);
  const reader = createInterface({ input: stdin, output: stderr, terminal, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  const inputEnded = new Error("Input ended.");
  let interrupted = false;
  let closed = false;

  function cancel() {
    interrupted = true;
    reader.close();
  }

  async function ask<T>({ prompt, parse }: Question<T>): Promise<T> {
    while (true) {
      if (!terminal) {
        stderr.write(`${prompt}\n`);
      } else if (!closed) {
        reader.setPrompt(`${prompt} > `);
        reader.prompt();
      }
      const answer = await lines.next();
      if (interrupted || answer.done) throw inputEnded;

      const value = parse(answer.value.trim());
      if (value !== undefined) return value;
      stderr.write("Enter a valid value.\n");
    }
  }

  reader.once("close", () => { closed = true; });
  reader.once("SIGINT", cancel);
  process.once("SIGINT", cancel);
  try {
    const input: CapacityInput = {
      publisherCount: await ask(questions.publisherCount),
      messageSize: await ask(questions.messageSize),
      messageSizeUnit: await ask(questions.messageSizeUnit),
      messageFrequency: await ask(questions.messageFrequency),
      frequencyUnit: await ask(questions.frequencyUnit),
      publisherLanguage: await ask(questions.publisherLanguage),
      subscriberLanguage: await ask(questions.subscriberLanguage),
      serialization: await ask(questions.serialization),
    };

    while (true) {
      const estimate = estimateCapacity(input);
      if (estimate.ok) {
        stdout.write(`${formatReport(estimate.result)}\n`);
        return 0;
      }

      const { code, field } = estimate.error;
      if (field === "messageSize") {
        stderr.write("Enter a size that converts to a whole number of bytes in the allowed range.\n");
        input.messageSize = await ask(questions.messageSize);
        input.messageSizeUnit = await ask(questions.messageSizeUnit);
      } else if (field === "messageFrequency") {
        stderr.write("The converted frequency is outside the allowed range.\n");
        input.messageFrequency = await ask(questions.messageFrequency);
        input.frequencyUnit = await ask(questions.frequencyUnit);
      } else {
        stderr.write(`Calculation error (${code}, ${field}). ${estimate.error.message}\n`);
        return 1;
      }
    }
  } catch (error) {
    if (error !== inputEnded) throw error;
    if (terminal) stderr.write("\n");
    stderr.write(interrupted ? "Calculation canceled.\n" : "Input ended before the calculation.\n");
    return interrupted ? 130 : 2;
  } finally {
    process.removeListener("SIGINT", cancel);
    reader.close();
  }
}

async function main(args: string[]): Promise<number> {
  if (args.length === 0) return runWizard();
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return 0;
  }

  process.stderr.write(`Unknown argument.\n${usage}\n`);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
