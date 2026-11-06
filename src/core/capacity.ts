/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { NormalizedInput } from "../models/input.js";
import type {
  CpuEstimate,
  QueueEstimate,
  SubscriberCapacity,
  TrafficEstimate,
  WarningCode,
} from "../models/result.js";
import { settings } from "../profiles/config.js";
import { checkedNumber } from "../validation/validate.js";
import { oneCoreMessageRate } from "./cpu.js";

export function analyzeCapacity(
  input: NormalizedInput,
  traffic: TrafficEstimate,
  cpu: CpuEstimate,
  queue: QueueEstimate,
): { capacity: SubscriberCapacity; warnings: WarningCode[] } {
  const estimatedSingleThreadCapacityMsgPerSecond = oneCoreMessageRate(
    cpu.cpuMicrosecondsPerMessage,
  );
  // Ref ../../ARCHITECTURE.md#overload-and-warnings
  // Q_growth = max(0, R - mu) × T. T is the buffer window in seconds.
  const excessRate = Math.max(
    0,
    traffic.totalMessagesPerSecond - estimatedSingleThreadCapacityMsgPerSecond,
  );
  const estimatedUnservedMessagesInWindow = checkedNumber(
    excessRate * queue.windowSeconds,
    "estimatedUnservedMessagesInWindow",
  );
  const cpuSingleThreadRisk =
    cpu.cpuCoresNominal >= settings.singleThreadWarningThreshold;
  const conservativeRisk = cpu.cpuCoresHigh >= 1;

  const warnings: WarningCode[] = [
    "UNVALIDATED_COEFFICIENTS",
    "KERNEL_MEMORY_NOT_INCLUDED",
    "HWM_NOT_HARD_RSS_LIMIT",
  ];
  if (cpuSingleThreadRisk) warnings.push("CPU_SINGLE_THREAD_RISK");
  if (cpu.cpuCoresNominal >= 1) warnings.push("CPU_DEMAND_EXCEEDS_ONE_CORE");
  if (conservativeRisk)
    warnings.push("CPU_CONSERVATIVE_DEMAND_EXCEEDS_ONE_CORE");
  if (excessRate > 0) warnings.push("OFFERED_LOAD_EXCEEDS_CAPACITY");
  if (excessRate > 0 || conservativeRisk)
    warnings.push("POTENTIAL_PUBSUB_MESSAGE_LOSS");
  if (
    traffic.totalMessagesPerSecond >=
    settings.highMessageRateWarningMsgPerSecond
  ) {
    warnings.push("HIGH_MESSAGE_RATE");
  }
  if (input.messageBytes >= settings.largeMessageWarningBytes)
    warnings.push("LARGE_MESSAGE_SIZE");
  if (input.publisherCount >= settings.largePublisherCountWarning)
    warnings.push("LARGE_PUBLISHER_COUNT");

  return {
    capacity: {
      estimatedSingleThreadCapacityMsgPerSecond,
      estimatedUnservedMessagesInWindow,
      cpuSingleThreadRisk,
    },
    warnings,
  };
}
