/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { MessageSizeUnit, NormalizedInput } from "../models/input.js";
import {
  CalculationError,
  checkedNumber,
  validateInput,
} from "../validation/validate.js";
import { BYTES_PER_KIB, BYTES_PER_MIB } from "./units.js";

const sizeMultipliers: Record<MessageSizeUnit, number> = {
  B: 1,
  KiB: BYTES_PER_KIB,
  MiB: BYTES_PER_MIB,
};

export function normalizeInput(input: unknown): NormalizedInput {
  validateInput(input);
  const {
    publisherCount,
    messageSize,
    messageSizeUnit,
    messageFrequency,
    frequencyUnit,
  } = input;
  // Specification §4.1. S = messageSize × sizeMultiplier in bytes.
  const messageBytes = checkedNumber(
    messageSize * sizeMultipliers[messageSizeUnit],
    "messageSize",
  );
  if (!Number.isInteger(messageBytes)) {
    throw new CalculationError(
      "INVALID_INPUT",
      "messageSize",
      "Size must convert to a whole number of bytes.",
    );
  }
  if (!Number.isSafeInteger(messageBytes)) {
    throw new CalculationError(
      "NUMERIC_RANGE",
      "messageSize",
      "Size in bytes must be a safe integer.",
    );
  }

  // Specification §4.2. f = messageFrequency × frequencyMultiplier in msg/s per publisher.
  // The multipliers for minute, second, and millisecond are 1/60, 1, and 1000.
  let rate = messageFrequency;
  if (frequencyUnit === "minute") rate /= 60;
  if (frequencyUnit === "millisecond") rate *= 1000;
  const messagesPerSecondPerPublisher = checkedNumber(
    rate,
    "messageFrequency",
    messageFrequency > 0 ? Number.MIN_VALUE : 0,
  );

  return {
    publisherCount,
    messageBytes,
    messagesPerSecondPerPublisher,
    publisherLanguage: input.publisherLanguage,
    subscriberLanguage: input.subscriberLanguage,
    serialization: input.serialization,
  };
}
