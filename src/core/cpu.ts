/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { CpuEstimate } from "../models/result.js";
import { settings, type CpuCoefficients } from "../profiles/config.js";
import { checkedNumber } from "../validation/validate.js";
import { BYTES_PER_KIB, MICROSECONDS_PER_SECOND } from "./units.js";

export function oneCoreMessageRate(microsecondsPerMessage: number): number {
  // Ref ../../ARCHITECTURE.md#overload-and-warnings
  // mu = 1 000 000 / t_msg in msg/s. For the subscriber, t_msg = t_sub.
  return checkedNumber(
    MICROSECONDS_PER_SECOND / microsecondsPerMessage,
    "estimatedSingleThreadCapacityMsgPerSecond",
    Number.MIN_VALUE,
  );
}

export function estimateCpu(
  messagesPerSecond: number,
  messageBytes: number,
  { a, b }: CpuCoefficients,
): CpuEstimate {
  // Ref ../../ARCHITECTURE.md#cpu-model
  // t_msg = a + b × S_kib in µs, where S_kib = S / 1024.
  // For a and b by language and format, ref ../../ARCHITECTURE.md#cpu-profiles
  const cpuMicrosecondsPerMessage = checkedNumber(
    a + b * (messageBytes / BYTES_PER_KIB),
    "cpuMicrosecondsPerMessage",
    Number.MIN_VALUE,
  );
  // Ref ../../ARCHITECTURE.md#cpu-model
  // C_pub = f × t_pub / 1 000 000, C_sub = R × t_sub / 1 000 000.
  // Both formulas use C = messagesPerSecond / (1 000 000 / t_msg).
  const cores =
    messagesPerSecond / oneCoreMessageRate(cpuMicrosecondsPerMessage);

  // In model 1.0, C_low = 0.5 × C, C_nominal = 1.0 × C, C_high = 3.0 × C.
  const cpuCoresLow = checkedNumber(
    cores * settings.cpuOptimisticFactor,
    "cpuCoresLow",
    messagesPerSecond > 0 ? Number.MIN_VALUE : 0,
  );
  const cpuCoresNominal = cores * settings.cpuNominalFactor;
  const cpuCoresHigh = cores * settings.cpuConservativeFactor;

  return {
    cpuMicrosecondsPerMessage,
    cpuCoresLow,
    cpuCoresNominal,
    cpuCoresHigh,
    // CPU_percent = 100 × C for each scenario.
    cpuPercentLow: 100 * cpuCoresLow,
    cpuPercentNominal: 100 * cpuCoresNominal,
    cpuPercentHigh: checkedNumber(100 * cpuCoresHigh, "cpuPercentHigh"),
  };
}
