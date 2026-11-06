/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import fc from "fast-check";
import { expect, test } from "vitest";
import {
  frequencyUnits,
  messageSizeUnits,
  publisherLanguages,
  serializations,
  subscriberLanguages,
} from "../models/input.js";
import { calculate } from "./fixtures.js";

const inputArbitrary = fc.record({
  publisherCount: fc.integer({ min: 1, max: 2000 }),
  messageSize: fc.integer({ min: 1, max: 65536 }),
  messageSizeUnit: fc.constantFrom(...messageSizeUnits),
  messageFrequency: fc
    .integer({ min: 0, max: 500000 })
    .map((hundredths) => hundredths / 100),
  frequencyUnit: fc.constantFrom(...frequencyUnits),
  publisherLanguage: fc.constantFrom(...publisherLanguages),
  subscriberLanguage: fc.constantFrom(...subscriberLanguages),
  serialization: fc.constantFrom(...serializations),
});

const roles = ["publisher", "subscriber"] as const;
const ramFields = [
  "ramWindowMiBLow",
  "ramWindowMiBNominal",
  "ramWindowMiBHigh",
  "ramFullMiBLow",
  "ramFullMiBNominal",
  "ramFullMiBHigh",
] as const;

test("adding sources cannot reduce traffic or Subscriber RAM", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const original = calculate(input);
      const moreSources = calculate({
        ...input,
        publisherCount: input.publisherCount + 1,
      });
      expect(moreSources.traffic.totalMessagesPerSecond).toBeGreaterThanOrEqual(
        original.traffic.totalMessagesPerSecond,
      );
      expect(moreSources.traffic.payloadBytesPerSecond).toBeGreaterThanOrEqual(
        original.traffic.payloadBytesPerSecond,
      );
      for (const field of ramFields) {
        expect(moreSources.subscriber[field]).toBeGreaterThanOrEqual(
          original.subscriber[field],
        );
      }
    }),
  );
});

test("increasing frequency cannot reduce CPU work", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const original = calculate(input);
      const faster = calculate({
        ...input,
        messageFrequency: input.messageFrequency + 0.125,
      });
      for (const role of roles) {
        expect(faster[role].cpuCoresLow).toBeGreaterThanOrEqual(
          original[role].cpuCoresLow,
        );
        expect(faster[role].cpuCoresNominal).toBeGreaterThanOrEqual(
          original[role].cpuCoresNominal,
        );
        expect(faster[role].cpuCoresHigh).toBeGreaterThanOrEqual(
          original[role].cpuCoresHigh,
        );
      }
    }),
  );
});

test("increasing message size cannot reduce traffic or queue RAM", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const original = calculate(input);
      const larger = calculate({
        ...input,
        messageSize: input.messageSize + 1,
      });
      expect(larger.traffic.payloadBytesPerSecond).toBeGreaterThanOrEqual(
        original.traffic.payloadBytesPerSecond,
      );
      for (const role of roles) {
        for (const field of ramFields) {
          expect(larger[role][field]).toBeGreaterThanOrEqual(
            original[role][field],
          );
        }
      }
    }),
  );
});

test("scenarios are ordered and queue depth stays within HWM", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const result = calculate(input);
      expect(result.queue.messagesPerPeerWindow).toBeLessThanOrEqual(
        result.queue.hwm,
      );
      for (const role of roles) {
        const process = result[role];
        expect(process.cpuCoresLow).toBeLessThanOrEqual(
          process.cpuCoresNominal,
        );
        expect(process.cpuCoresNominal).toBeLessThanOrEqual(
          process.cpuCoresHigh,
        );
        expect(process.ramWindowMiBLow).toBeLessThanOrEqual(
          process.ramWindowMiBNominal,
        );
        expect(process.ramWindowMiBNominal).toBeLessThanOrEqual(
          process.ramWindowMiBHigh,
        );
        expect(process.ramFullMiBLow).toBeLessThanOrEqual(
          process.ramFullMiBNominal,
        );
        expect(process.ramFullMiBNominal).toBeLessThanOrEqual(
          process.ramFullMiBHigh,
        );
      }
    }),
  );
});

test("the language of each role leaves the other role's estimate unchanged", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const original = calculate(input);
      const publisherLanguage =
        input.publisherLanguage === "cpp" ? "python" : "cpp";
      const subscriberLanguage =
        input.subscriberLanguage === "java" ? "cpp" : "java";
      const otherPublisher = calculate({ ...input, publisherLanguage });
      const otherSubscriber = calculate({ ...input, subscriberLanguage });
      expect(otherPublisher.traffic).toEqual(original.traffic);
      expect(otherPublisher.subscriber).toEqual(original.subscriber);
      expect(otherSubscriber.publisher).toEqual(original.publisher);
    }),
  );
});

test("JSON and Protobuf share the supplied size, traffic and RAM", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const json = calculate({ ...input, serialization: "json" });
      const protobuf = calculate({ ...input, serialization: "protobuf" });
      expect(protobuf.normalizedInput.messageBytes).toBe(
        json.normalizedInput.messageBytes,
      );
      expect(protobuf.traffic).toEqual(json.traffic);
      for (const role of roles) {
        for (const field of ramFields) {
          expect(protobuf[role][field]).toBe(json[role][field]);
        }
      }
    }),
  );
});

test("zero traffic yields zero message-related CPU in every scenario", () => {
  fc.assert(
    fc.property(inputArbitrary, (input) => {
      const result = calculate({ ...input, messageFrequency: 0 });
      for (const role of roles) {
        expect(result[role]).toMatchObject({
          cpuCoresLow: 0,
          cpuCoresNominal: 0,
          cpuCoresHigh: 0,
          cpuPercentLow: 0,
          cpuPercentNominal: 0,
          cpuPercentHigh: 0,
        });
      }
    }),
  );
});
