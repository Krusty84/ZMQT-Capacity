/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { analyzeCapacity } from "./core/capacity.js";
import { estimateCpu } from "./core/cpu.js";
import { estimateMemory } from "./core/memory.js";
import { normalizeInput } from "./core/normalize.js";
import { estimateQueue } from "./core/queue.js";
import { estimateTraffic } from "./core/traffic.js";
import type { CapacityResult } from "./models/result.js";
import { profiles, settings } from "./profiles/config.js";
import {
  CalculationError,
  validateConfigVersion,
} from "./validation/validate.js";

export type { CapacityInput, NormalizedInput } from "./models/input.js";
export type {
  CapacityError,
  CapacityEstimate,
  CapacityResult,
  WarningCode,
} from "./models/result.js";

const modelVersion = "1.0";
const assumptions = [
  "Identical publisher processes send messages to one subscriber over TCP. Each message contains one serialized frame. At a given message size, the serialization format affects CPU use.",
  "The model uses profiles for PyZMQ/libzmq (Python), cppzmq/libzmq (C++), and Spring Boot with JeroMQ (Java).",
  "Traffic estimates cover the payload only. The model excludes headers, ZMTP, acknowledgments, retransmissions, fragmentation, packetization, encryption, and compression.",
  "The CPU estimate expresses the additional load at the offered message rate as a fraction and a percentage of one logical core. The model excludes background load and business logic. The coefficients are engineering assumptions.",
  "The throughput estimate uses one sequential handler and the nominal cost per message. The model estimates unserved messages over the buffer window without accounting for message loss.",
  "The RAM estimate covers resident process memory. The nominal estimate is the mean of the low and high estimates. Estimate the JVM heap size and -Xmx separately.",
  "The model estimates queues per connection. The full HWM scenario uses an assumed queue depth. Actual RAM use can exceed the high estimate.",
  "The RAM estimate excludes kernel TCP buffers, application queues, caches, extra copies, large temporary allocations, business logic, OS services, the effects of GC tuning, and nonresident virtual memory.",
  "PUB/SUB can lose messages under overload. The model excludes delivery guarantees, retention of the last N messages, latency, and suitability for hard real-time use.",
];

export function estimateCapacity(input: unknown): CapacityResult {
  try {
    const normalizedInput = normalizeInput(input);
    validateConfigVersion(settings.configVersion);
    const {
      publisherCount,
      messageBytes,
      messagesPerSecondPerPublisher,
      serialization,
    } = normalizedInput;
    const publisherProfile =
      profiles.publisher[normalizedInput.publisherLanguage];
    const subscriberProfile =
      profiles.subscriber[normalizedInput.subscriberLanguage];

    const traffic = estimateTraffic(normalizedInput);
    const publisherCpu = estimateCpu(
      messagesPerSecondPerPublisher,
      messageBytes,
      publisherProfile.cpu[serialization],
    );
    const subscriberCpu = estimateCpu(
      traffic.totalMessagesPerSecond,
      messageBytes,
      subscriberProfile.cpu[serialization],
    );
    const queue = estimateQueue(messagesPerSecondPerPublisher);
    const publisherMemory = estimateMemory(
      messageBytes,
      1,
      queue,
      publisherProfile,
    );
    const subscriberMemory = estimateMemory(
      messageBytes,
      publisherCount,
      queue,
      subscriberProfile,
    );
    const { capacity, warnings } = analyzeCapacity(
      normalizedInput,
      traffic,
      subscriberCpu,
      queue,
    );

    return {
      ok: true,
      result: {
        normalizedInput,
        traffic,
        publisher: { ...publisherCpu, ...publisherMemory },
        subscriber: {
          ...subscriberCpu,
          ...subscriberMemory,
          ...capacity,
          connectionCount: publisherCount,
        },
        queue,
        metadata: {
          configVersion: settings.configVersion,
          modelVersion,
          estimationMethod: "heuristic",
          preliminary: true,
          assumptions: [...assumptions],
          warnings,
        },
      },
    };
  } catch (error) {
    if (!(error instanceof CalculationError)) throw error;
    return {
      ok: false,
      error: { code: error.code, field: error.field, message: error.message },
    };
  }
}
