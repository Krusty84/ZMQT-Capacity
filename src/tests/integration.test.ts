/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { expect, test } from "vitest";
import { calculate } from "./fixtures.js";

test("matches the model 1.0 reference case with configuration 1.0.0", () => {
  const result = calculate();
  expect(result.normalizedInput).toEqual({
    publisherCount: 300,
    messageBytes: 1024,
    messagesPerSecondPerPublisher: 20,
    publisherLanguage: "python",
    subscriberLanguage: "java",
    serialization: "json",
  });
  expect(result.traffic).toEqual({
    totalMessagesPerSecond: 6000,
    payloadBytesPerSecond: 6144000,
    payloadMBPerSecond: 6.144,
    payloadMbps: 49.152,
  });
  expect(result.publisher.cpuMicrosecondsPerMessage).toBe(50);
  expect(result.subscriber.cpuMicrosecondsPerMessage).toBe(38);
  expect(result.publisher.cpuCoresNominal).toBeCloseTo(0.001, 14);
  expect(result.subscriber.cpuCoresNominal).toBeCloseTo(0.228, 14);

  const ramToleranceMiB = 0.01;
  const { subscriber } = result;
  const referenceRam = [
    [subscriber.ramWindowMiBLow, 281.34],
    [subscriber.ramWindowMiBNominal, 482.57],
    [subscriber.ramWindowMiBHigh, 683.79],
    [subscriber.ramFullMiBLow, 604.34],
    [subscriber.ramFullMiBNominal, 859.4],
    [subscriber.ramFullMiBHigh, 1114.45],
  ];
  for (const [actual, expected] of referenceRam) {
    expect(Math.abs(Number(actual.toFixed(2)) - expected)).toBeLessThanOrEqual(
      ramToleranceMiB,
    );
  }

  expect(result.queue.messagesPerPeerWindow).toBe(20);
  expect(result.queue.messagesPerPeerFull).toBe(1000);
  expect(result.metadata).toMatchObject({
    modelVersion: "1.0",
    configVersion: "1.0.0",
    estimationMethod: "heuristic",
    preliminary: true,
    warnings: [
      "UNVALIDATED_COEFFICIENTS",
      "KERNEL_MEMORY_NOT_INCLUDED",
      "HWM_NOT_HARD_RSS_LIMIT",
    ],
  });
  expect(result.metadata.assumptions.length).toBeGreaterThan(0);
  expect(calculate()).toEqual(result);
});

test("distinguishes nominal CPU, conservative risk and excess offered load", () => {
  // The Java JSON profile takes 200 µs at 10 KiB, or 5000 messages/s per core.
  const options = { publisherCount: 1, messageSize: 10240 };
  const conservative = calculate({ ...options, messageFrequency: 5000 / 3 });
  expect(conservative.subscriber.cpuCoresHigh).toBeCloseTo(1, 14);
  expect(conservative.subscriber.cpuSingleThreadRisk).toBe(false);
  expect(conservative.metadata.warnings).toContain(
    "CPU_CONSERVATIVE_DEMAND_EXCEEDS_ONE_CORE",
  );
  expect(conservative.metadata.warnings).toContain(
    "POTENTIAL_PUBSUB_MESSAGE_LOSS",
  );
  expect(conservative.metadata.warnings).not.toContain(
    "OFFERED_LOAD_EXCEEDS_CAPACITY",
  );

  const belowThreshold = calculate({ ...options, messageFrequency: 3499.9 });
  expect(belowThreshold.subscriber.cpuSingleThreadRisk).toBe(false);
  const atThreshold = calculate({ ...options, messageFrequency: 3500 });
  expect(atThreshold.subscriber.cpuSingleThreadRisk).toBe(true);
  expect(atThreshold.metadata.warnings).toContain("CPU_SINGLE_THREAD_RISK");
  expect(atThreshold.metadata.warnings).not.toContain(
    "CPU_DEMAND_EXCEEDS_ONE_CORE",
  );

  const atCapacity = calculate({ ...options, messageFrequency: 5000 });
  expect(atCapacity.subscriber.estimatedSingleThreadCapacityMsgPerSecond).toBe(
    5000,
  );
  expect(atCapacity.subscriber.estimatedUnservedMessagesInWindow).toBe(0);
  expect(atCapacity.metadata.warnings).toContain("CPU_DEMAND_EXCEEDS_ONE_CORE");
  expect(atCapacity.metadata.warnings).not.toContain(
    "OFFERED_LOAD_EXCEEDS_CAPACITY",
  );

  const overloaded = calculate({ ...options, messageFrequency: 5123.5 });
  expect(overloaded.subscriber.estimatedUnservedMessagesInWindow).toBe(123.5);
  expect(overloaded.metadata.warnings).toContain(
    "OFFERED_LOAD_EXCEEDS_CAPACITY",
  );
  expect(overloaded.metadata.warnings).toContain(
    "POTENTIAL_PUBSUB_MESSAGE_LOSS",
  );
  expect(overloaded.subscriber.ramWindowMiBHigh).toBe(
    atCapacity.subscriber.ramWindowMiBHigh,
  );
});

test("warns at configured message size, total rate and source count thresholds", () => {
  const below = calculate({
    publisherCount: 999,
    messageSize: 65535,
    messageFrequency: 100,
  });
  expect(below.metadata.warnings).not.toContain("LARGE_MESSAGE_SIZE");
  expect(below.metadata.warnings).not.toContain("HIGH_MESSAGE_RATE");
  expect(below.metadata.warnings).not.toContain("LARGE_PUBLISHER_COUNT");

  const atThresholds = calculate({
    publisherCount: 1000,
    messageSize: 65536,
    messageFrequency: 100,
  });
  expect(atThresholds.metadata.warnings).toEqual(
    expect.arrayContaining([
      "LARGE_MESSAGE_SIZE",
      "HIGH_MESSAGE_RATE",
      "LARGE_PUBLISHER_COUNT",
    ]),
  );
});

test("reports one core when the input rate equals a fractional single-thread capacity", () => {
  const rateAtCapacity = 1_000_000 / (20 + 18 / 1024);
  const result = calculate({
    publisherCount: 1,
    messageSize: 1,
    messageFrequency: rateAtCapacity,
  });
  expect(result.subscriber.estimatedSingleThreadCapacityMsgPerSecond).toBe(
    rateAtCapacity,
  );
  expect(result.subscriber.cpuCoresNominal).toBe(1);
  expect(result.subscriber.estimatedUnservedMessagesInWindow).toBe(0);
  expect(result.metadata.warnings).toContain("CPU_DEMAND_EXCEEDS_ONE_CORE");
  expect(result.metadata.warnings).not.toContain(
    "OFFERED_LOAD_EXCEEDS_CAPACITY",
  );
});
