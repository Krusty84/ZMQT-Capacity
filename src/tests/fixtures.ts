/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { estimateCapacity } from "../index.js";
import type { CapacityEstimate, CapacityInput } from "../index.js";

export const referenceInput = {
  publisherCount: 300,
  messageSize: 1024,
  messageSizeUnit: "B",
  messageFrequency: 20,
  frequencyUnit: "second",
  publisherLanguage: "python",
  subscriberLanguage: "java",
  serialization: "json",
} as const satisfies CapacityInput;

export function calculate(
  overrides: Partial<CapacityInput> = {},
): CapacityEstimate {
  const outcome = estimateCapacity({ ...referenceInput, ...overrides });
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
  return outcome.result;
}
