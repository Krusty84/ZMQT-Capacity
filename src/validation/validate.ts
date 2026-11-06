/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import {
  frequencyUnits,
  messageSizeUnits,
  publisherLanguages,
  serializations,
  subscriberLanguages,
} from "../models/input.js";
import type { CapacityInput } from "../models/input.js";
import type { CapacityError } from "../models/result.js";

export class CalculationError extends Error {
  constructor(
    readonly code: CapacityError["code"],
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function validateChoice(
  value: unknown,
  field: string,
  choices: readonly string[],
): void {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new CalculationError(
      "INVALID_INPUT",
      field,
      `Expected one of ${choices.join(", ")}.`,
    );
  }
}

export function validateInput(input: unknown): asserts input is CapacityInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CalculationError(
      "INVALID_INPUT",
      "input",
      "Expected an input object.",
    );
  }

  const fields = input as Record<string, unknown>;
  const { publisherCount, messageSize, messageFrequency } = fields;

  if (
    typeof publisherCount !== "number" ||
    !Number.isSafeInteger(publisherCount) ||
    publisherCount < 1
  ) {
    throw new CalculationError(
      "INVALID_INPUT",
      "publisherCount",
      "Expected a positive safe integer.",
    );
  }
  if (
    typeof messageSize !== "number" ||
    !Number.isFinite(messageSize) ||
    messageSize <= 0
  ) {
    throw new CalculationError(
      "INVALID_INPUT",
      "messageSize",
      "Expected a positive finite number.",
    );
  }
  if (
    typeof messageFrequency !== "number" ||
    !Number.isFinite(messageFrequency) ||
    messageFrequency < 0
  ) {
    throw new CalculationError(
      "INVALID_INPUT",
      "messageFrequency",
      "Expected a nonnegative finite number.",
    );
  }

  validateChoice(fields.messageSizeUnit, "messageSizeUnit", messageSizeUnits);
  validateChoice(fields.frequencyUnit, "frequencyUnit", frequencyUnits);
  validateChoice(
    fields.publisherLanguage,
    "publisherLanguage",
    publisherLanguages,
  );
  validateChoice(
    fields.subscriberLanguage,
    "subscriberLanguage",
    subscriberLanguages,
  );
  validateChoice(fields.serialization, "serialization", serializations);
}

export function validateConfigVersion(version: unknown): void {
  if (
    typeof version !== "string" ||
    !/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
  ) {
    throw new CalculationError(
      "INVALID_CONFIG_VERSION",
      "configVersion",
      "Expected a configuration version in 1.x.y.",
    );
  }
}

export function checkedNumber(
  value: number,
  field: string,
  minimum = 0,
): number {
  if (!Number.isFinite(value) || value < minimum) {
    throw new CalculationError(
      "NUMERIC_RANGE",
      field,
      "Value is outside the supported numeric range.",
    );
  }
  return value === 0 ? 0 : value;
}
