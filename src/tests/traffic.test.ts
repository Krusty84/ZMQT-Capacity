/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { expect, test } from "vitest";
import { normalizeInput } from "../core/normalize.js";
import { estimateTraffic } from "../core/traffic.js";
import { referenceInput } from "./fixtures.js";

test.each([
  [1, "B", 1],
  [1, "KiB", 1024],
  [0.5, "KiB", 512],
  [1, "MiB", 1048576],
  [1 / 1048576, "MiB", 1],
])("normalizes %s %s to %s bytes", (messageSize, messageSizeUnit, bytes) => {
  expect(
    normalizeInput({ ...referenceInput, messageSize, messageSizeUnit })
      .messageBytes,
  ).toBe(bytes);
});

test.each([
  [60, "minute", 1],
  [1, "minute", 1 / 60],
  [20, "second", 20],
  [0.5, "second", 0.5],
  [1, "millisecond", 1000],
])(
  "normalizes %s messages per %s to %s msg/s",
  (messageFrequency, frequencyUnit, rate) => {
    const input = normalizeInput({
      ...referenceInput,
      messageFrequency,
      frequencyUnit,
    });
    expect(input.messagesPerSecondPerPublisher).toBeCloseTo(rate, 14);
  },
);

test("calculates decimal payload throughput from the unrounded rate", () => {
  const input = normalizeInput({
    ...referenceInput,
    publisherCount: 3,
    messageFrequency: 1,
    frequencyUnit: "minute",
  });
  const traffic = estimateTraffic(input);
  expect(traffic.totalMessagesPerSecond).toBeCloseTo(0.05, 14);
  expect(traffic.payloadBytesPerSecond).toBeCloseTo(51.2, 12);
  expect(traffic.payloadMBPerSecond).toBeCloseTo(0.0000512, 14);
  expect(traffic.payloadMbps).toBeCloseTo(0.0004096, 14);
});
