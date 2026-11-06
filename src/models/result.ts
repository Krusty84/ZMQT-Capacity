/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { NormalizedInput } from "./input.js";

export interface TrafficEstimate {
  totalMessagesPerSecond: number;
  payloadBytesPerSecond: number;
  payloadMBPerSecond: number;
  payloadMbps: number;
}

export interface CpuEstimate {
  cpuMicrosecondsPerMessage: number;
  cpuCoresLow: number;
  cpuCoresNominal: number;
  cpuCoresHigh: number;
  cpuPercentLow: number;
  cpuPercentNominal: number;
  cpuPercentHigh: number;
}

export interface MemoryEstimate {
  ramWindowMiBLow: number;
  ramWindowMiBNominal: number;
  ramWindowMiBHigh: number;
  ramFullMiBLow: number;
  ramFullMiBNominal: number;
  ramFullMiBHigh: number;
}

export interface SubscriberCapacity {
  estimatedSingleThreadCapacityMsgPerSecond: number;
  estimatedUnservedMessagesInWindow: number;
  cpuSingleThreadRisk: boolean;
}

export interface QueueEstimate {
  hwm: number;
  windowSeconds: number;
  messagesPerPeerWindow: number;
  messagesPerPeerFull: number;
}

export type WarningCode =
  | "UNVALIDATED_COEFFICIENTS"
  | "CPU_SINGLE_THREAD_RISK"
  | "CPU_DEMAND_EXCEEDS_ONE_CORE"
  | "CPU_CONSERVATIVE_DEMAND_EXCEEDS_ONE_CORE"
  | "OFFERED_LOAD_EXCEEDS_CAPACITY"
  | "HIGH_MESSAGE_RATE"
  | "LARGE_MESSAGE_SIZE"
  | "LARGE_PUBLISHER_COUNT"
  | "POTENTIAL_PUBSUB_MESSAGE_LOSS"
  | "KERNEL_MEMORY_NOT_INCLUDED"
  | "HWM_NOT_HARD_RSS_LIMIT";

export interface CapacityEstimate {
  normalizedInput: NormalizedInput;
  traffic: TrafficEstimate;
  publisher: CpuEstimate & MemoryEstimate;
  subscriber: CpuEstimate &
    MemoryEstimate &
    SubscriberCapacity & { connectionCount: number };
  queue: QueueEstimate;
  metadata: {
    configVersion: string;
    modelVersion: string;
    estimationMethod: "heuristic";
    preliminary: true;
    assumptions: string[];
    warnings: WarningCode[];
  };
}

export interface CapacityError {
  code: "INVALID_INPUT" | "INVALID_CONFIG_VERSION" | "NUMERIC_RANGE";
  field: string;
  message: string;
}

export type CapacityResult =
  | { ok: true; result: CapacityEstimate }
  | { ok: false; error: CapacityError };
