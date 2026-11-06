/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, test } from "vitest";
import type { CpuEstimate } from "../models/result.js";
import { calculate } from "./fixtures.js";

const publishers = [
  { language: "python", json: [25, 25], protobuf: [15, 7] },
  { language: "cpp", json: [8, 12], protobuf: [4, 4] },
] as const;

const subscribers = [
  { language: "java", json: [20, 18], protobuf: [12, 6] },
  { language: "python", json: [30, 26], protobuf: [18, 8] },
  { language: "cpp", json: [8, 11], protobuf: [5, 4] },
] as const;

function expectCpu(
  estimate: CpuEstimate,
  [a, b]: readonly [number, number],
  bytes: number,
  rate: number,
): void {
  const microseconds = a + b * (bytes / 1024);
  const cores = (rate * microseconds) / 1_000_000;
  expect(estimate.cpuMicrosecondsPerMessage).toBeCloseTo(microseconds, 12);
  expect(estimate.cpuCoresLow).toBeCloseTo(0.5 * cores, 14);
  expect(estimate.cpuCoresNominal).toBeCloseTo(cores, 14);
  expect(estimate.cpuCoresHigh).toBeCloseTo(3 * cores, 14);
  expect(estimate.cpuPercentLow).toBeCloseTo(50 * cores, 12);
  expect(estimate.cpuPercentNominal).toBeCloseTo(100 * cores, 12);
  expect(estimate.cpuPercentHigh).toBeCloseTo(300 * cores, 12);
}

describe.each(publishers)("$language Publisher", (publisher) => {
  describe.each(subscribers)("$language Subscriber", (subscriber) => {
    describe.each(["json", "protobuf"] as const)("%s", (serialization) => {
      test.each([1, 256, 1024, 65536])("calculates CPU for %s B", (bytes) => {
        const count = 13;
        const rate = 1.23456789;
        const result = calculate({
          publisherCount: count,
          messageSize: bytes,
          messageFrequency: rate,
          publisherLanguage: publisher.language,
          subscriberLanguage: subscriber.language,
          serialization,
        });

        expectCpu(result.publisher, publisher[serialization], bytes, rate);
        expectCpu(
          result.subscriber,
          subscriber[serialization],
          bytes,
          count * rate,
        );
      });
    });
  });
});
