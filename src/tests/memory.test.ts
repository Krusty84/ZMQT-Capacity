/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { expect, test } from "vitest";
import { estimateMemory } from "../core/memory.js";
import { estimateQueue } from "../core/queue.js";
import { profiles } from "../profiles/config.js";
import { calculate } from "./fixtures.js";

test.each([
  [
    "Python Publisher",
    profiles.publisher.python,
    [30, 100],
    [32, 160],
    [128, 512],
  ],
  ["C++ Publisher", profiles.publisher.cpp, [5, 30], [24, 128], [64, 256]],
  [
    "Java Subscriber",
    profiles.subscriber.java,
    [256, 600],
    [64, 256],
    [128, 512],
  ],
  [
    "Python Subscriber",
    profiles.subscriber.python,
    [30, 120],
    [32, 160],
    [128, 512],
  ],
  ["C++ Subscriber", profiles.subscriber.cpp, [10, 60], [24, 128], [64, 256]],
] as const)(
  "calculates base, connection and queued RAM for %s",
  (_name, profile, base, connection, overhead) => {
    const bytes = 1537;
    const queue = estimateQueue(2.5);

    for (const count of [0, 1, 3]) {
      const memory = estimateMemory(bytes, count, queue, profile);
      const windowLow =
        base[0] +
        (count * connection[0]) / 1024 +
        (count * 3 * (bytes + overhead[0])) / 1048576;
      const windowHigh =
        base[1] +
        (count * connection[1]) / 1024 +
        (count * 3 * (bytes + overhead[1])) / 1048576;
      const fullLow =
        base[0] +
        (count * connection[0]) / 1024 +
        (count * 1000 * (bytes + overhead[0])) / 1048576;
      const fullHigh =
        base[1] +
        (count * connection[1]) / 1024 +
        (count * 1000 * (bytes + overhead[1])) / 1048576;

      expect(memory.ramWindowMiBLow).toBeCloseTo(windowLow, 12);
      expect(memory.ramWindowMiBNominal).toBeCloseTo(
        (windowLow + windowHigh) / 2,
        12,
      );
      expect(memory.ramWindowMiBHigh).toBeCloseTo(windowHigh, 12);
      expect(memory.ramFullMiBLow).toBeCloseTo(fullLow, 12);
      expect(memory.ramFullMiBNominal).toBeCloseTo(
        (fullLow + fullHigh) / 2,
        12,
      );
      expect(memory.ramFullMiBHigh).toBeCloseTo(fullHigh, 12);
    }
  },
);

test.each([
  [0, 0],
  [0.5, 1],
  [20, 20],
  [1000, 1000],
  [2000, 1000],
])("assigns %s msg/s a window depth of %s messages per peer", (rate, depth) => {
  expect(estimateQueue(rate)).toEqual({
    hwm: 1000,
    windowSeconds: 1,
    messagesPerPeerWindow: depth,
    messagesPerPeerFull: 1000,
  });
});

test("keeps one connection per Publisher and one per source on the Subscriber", () => {
  const single = calculate({ publisherCount: 1, messageFrequency: 0 });
  const multiple = calculate({ publisherCount: 300, messageFrequency: 0 });
  expect(multiple.publisher).toEqual(single.publisher);
  expect(single.publisher.ramWindowMiBLow).toBeCloseTo(30 + 32 / 1024, 12);
  expect(multiple.subscriber.connectionCount).toBe(300);
  expect(multiple.subscriber.ramWindowMiBLow).toBeCloseTo(
    256 + (300 * 64) / 1024,
    12,
  );
  expect(multiple.subscriber.ramFullMiBLow).toBeGreaterThan(
    multiple.subscriber.ramWindowMiBLow,
  );
});
