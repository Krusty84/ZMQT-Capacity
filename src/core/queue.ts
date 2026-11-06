/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { QueueEstimate } from "../models/result.js";
import { settings } from "../profiles/config.js";
import { checkedNumber } from "../validation/validate.js";

export function estimateQueue(
  messagesPerSecondPerPublisher: number,
): QueueEstimate {
  const { hwm, queueWindowSeconds: windowSeconds } = settings;
  // Specification §7.4. Q_window = min(HWM, ceil(f × T_window)) in messages per connection.
  const windowMessages = checkedNumber(
    messagesPerSecondPerPublisher * windowSeconds,
    "messagesPerPeerWindow",
  );

  return {
    hwm,
    windowSeconds,
    messagesPerPeerWindow: Math.min(hwm, Math.ceil(windowMessages)),
    // Q_full = HWM.
    messagesPerPeerFull: hwm,
  };
}
