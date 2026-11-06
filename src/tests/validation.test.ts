/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { expect, test } from "vitest";
import { estimateCapacity } from "../index.js";
import { calculate, referenceInput } from "./fixtures.js";

test.each([null, undefined, 42, "input", []].map((input) => ({ input })))(
  "rejects invalid input $input",
  ({ input }) => {
    expect(estimateCapacity(input)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", field: "input" },
    });
  },
);

test.each(Object.keys(referenceInput))("rejects missing %s", (field) => {
  const input: Record<string, unknown> = { ...referenceInput };
  delete input[field];
  expect(estimateCapacity(input)).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", field },
  });
});

test.each([
  ["publisherCount", 0],
  ["publisherCount", -1],
  ["publisherCount", 1.5],
  ["publisherCount", Number.MAX_SAFE_INTEGER + 1],
  ["publisherCount", Infinity],
  ["publisherCount", "300"],
  ["messageSize", 0],
  ["messageSize", -1],
  ["messageSize", 0.5],
  ["messageSize", NaN],
  ["messageSize", Infinity],
  ["messageFrequency", -1],
  ["messageFrequency", NaN],
  ["messageFrequency", Infinity],
  ["messageSizeUnit", "KB"],
  ["frequencyUnit", "hour"],
  ["publisherLanguage", "java"],
  ["subscriberLanguage", "rust"],
  ["serialization", "xml"],
  ["serialization", "__proto__"],
] as const)("rejects %s = %s", (field, value) => {
  expect(estimateCapacity({ ...referenceInput, [field]: value })).toMatchObject(
    {
      ok: false,
      error: { code: "INVALID_INPUT", field, message: expect.any(String) },
    },
  );
});

test("accepts one source and one byte at zero frequency", () => {
  const result = calculate({
    publisherCount: 1,
    messageSize: 1,
    messageFrequency: 0,
  });
  expect(result.normalizedInput.messageBytes).toBe(1);
  expect(result.traffic).toEqual({
    totalMessagesPerSecond: 0,
    payloadBytesPerSecond: 0,
    payloadMBPerSecond: 0,
    payloadMbps: 0,
  });
  expect(result.queue.messagesPerPeerWindow).toBe(0);
  expect(result.subscriber.estimatedUnservedMessagesInWindow).toBe(0);
});

test("rejects a fractional byte size after unit conversion", () => {
  expect(
    estimateCapacity({
      ...referenceInput,
      messageSize: 0.1,
      messageSizeUnit: "KiB",
    }),
  ).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT", field: "messageSize" },
  });
});

test("accepts the largest safe integer byte size and source count", () => {
  const result = calculate({
    publisherCount: Number.MAX_SAFE_INTEGER,
    messageSize: Number.MAX_SAFE_INTEGER,
    messageFrequency: 0,
  });
  expect(result.normalizedInput.messageBytes).toBe(Number.MAX_SAFE_INTEGER);
  expect(result.subscriber.connectionCount).toBe(Number.MAX_SAFE_INTEGER);
  expect(Number.isFinite(result.subscriber.ramFullMiBHigh)).toBe(true);
  expect(result.metadata.warnings).toContain("LARGE_MESSAGE_SIZE");
  expect(result.metadata.warnings).toContain("LARGE_PUBLISHER_COUNT");
});

test("accepts a representable calculation at the largest finite frequency", () => {
  const result = calculate({
    publisherCount: 1,
    messageSize: 1,
    messageFrequency: Number.MAX_VALUE,
  });
  expect(result.traffic.payloadBytesPerSecond).toBe(Number.MAX_VALUE);
  expect(Number.isFinite(result.traffic.payloadMbps)).toBe(true);
  expect(Number.isFinite(result.subscriber.cpuPercentHigh)).toBe(true);
  expect(result.subscriber.estimatedUnservedMessagesInWindow).toBe(
    Number.MAX_VALUE,
  );
  expect(result.metadata.warnings).toContain("HIGH_MESSAGE_RATE");
});

test.each([
  ["messageSize", { messageSize: Number.MAX_SAFE_INTEGER + 1 }],
  ["messageSize", { messageSize: Number.MAX_VALUE, messageSizeUnit: "MiB" }],
  [
    "messageFrequency",
    { messageFrequency: Number.MAX_VALUE, frequencyUnit: "millisecond" },
  ],
  [
    "messageFrequency",
    { messageFrequency: Number.MIN_VALUE, frequencyUnit: "minute" },
  ],
  [
    "totalMessagesPerSecond",
    { publisherCount: 2, messageSize: 1, messageFrequency: Number.MAX_VALUE },
  ],
  [
    "payloadBytesPerSecond",
    { publisherCount: 1, messageSize: 2, messageFrequency: Number.MAX_VALUE },
  ],
] as const)("reports numeric range errors for %s", (field, overrides) => {
  expect(estimateCapacity({ ...referenceInput, ...overrides })).toMatchObject({
    ok: false,
    error: { code: "NUMERIC_RANGE", field, message: expect.any(String) },
  });
});
