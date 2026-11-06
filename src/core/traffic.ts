/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { NormalizedInput } from "../models/input.js";
import type { TrafficEstimate } from "../models/result.js";
import { checkedNumber } from "../validation/validate.js";
import { BYTES_PER_MB } from "./units.js";

export function estimateTraffic(input: NormalizedInput): TrafficEstimate {
  // Ref ../../ARCHITECTURE.md#payload-traffic
  // R = N × f, where N is the publisher count and f is the message rate per publisher.
  const totalMessagesPerSecond = checkedNumber(
    input.publisherCount * input.messagesPerSecondPerPublisher,
    "totalMessagesPerSecond",
  );
  // Ref ../../ARCHITECTURE.md#payload-traffic
  // B_payload = R × S in B/s, where S is the message size in bytes.
  const payloadBytesPerSecond = checkedNumber(
    totalMessagesPerSecond * input.messageBytes,
    "payloadBytesPerSecond",
  );
  // B_MBps = B_payload / 1 000 000.
  const payloadMBPerSecond = checkedNumber(
    payloadBytesPerSecond / BYTES_PER_MB,
    "payloadMBPerSecond",
    payloadBytesPerSecond > 0 ? Number.MIN_VALUE : 0,
  );

  return {
    totalMessagesPerSecond,
    payloadBytesPerSecond,
    payloadMBPerSecond,
    // B_Mbps = 8 × B_payload / 1 000 000 = B_payload / (1 000 000 / 8).
    payloadMbps: payloadBytesPerSecond / (BYTES_PER_MB / 8),
  };
}
