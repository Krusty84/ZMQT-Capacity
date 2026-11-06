/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type { MemoryEstimate, QueueEstimate } from "../models/result.js";
import type { ImplementationProfile } from "../profiles/config.js";
import { checkedNumber } from "../validation/validate.js";
import { BYTES_PER_KIB, BYTES_PER_MIB } from "./units.js";

export function estimateMemory(
  messageBytes: number,
  connectionCount: number,
  queue: QueueEstimate,
  { baseMiB, connectionKiB, messageOverheadBytes }: ImplementationProfile,
): MemoryEstimate {
  // Ref ../../ARCHITECTURE.md#ram-model
  // M_process = M_base + M_connections + M_queues.
  // M_connections = n × M_conn / 1024 in MiB, with M_conn in KiB. n = 1 for the publisher and N for the subscriber.
  const idleMiBLow =
    baseMiB.low + connectionCount * (connectionKiB.low / BYTES_PER_KIB);
  const idleMiBHigh =
    baseMiB.high + connectionCount * (connectionKiB.high / BYTES_PER_KIB);
  // (S + O) / 1 048 576 is the memory per message in MiB. S and O are in bytes.
  const messageMiBLow =
    (messageBytes + messageOverheadBytes.low) / BYTES_PER_MIB;
  const messageMiBHigh =
    (messageBytes + messageOverheadBytes.high) / BYTES_PER_MIB;

  function estimateRange(messagesPerPeer: number) {
    // Ref ../../ARCHITECTURE.md#ram-model
    // M_pub = M_base_pub + M_conn_pub + Q × (S + O_pub).
    // M_sub = M_base_sub + N × M_conn_sub + N × Q × (S + O_sub).
    // Apply the formulas to the low and high estimates in MiB with Q = Q_window or Q_full.
    const queuedMessages = connectionCount * messagesPerPeer;
    const low = checkedNumber(
      idleMiBLow + queuedMessages * messageMiBLow,
      "ramMiBLow",
    );
    const high = checkedNumber(
      idleMiBHigh + queuedMessages * messageMiBHigh,
      "ramMiBHigh",
    );
    // M_nominal = (M_low + M_high) / 2.
    return { low, nominal: low + (high - low) / 2, high };
  }

  const window = estimateRange(queue.messagesPerPeerWindow);
  const full = estimateRange(queue.messagesPerPeerFull);
  return {
    ramWindowMiBLow: window.low,
    ramWindowMiBNominal: window.nominal,
    ramWindowMiBHigh: window.high,
    ramFullMiBLow: full.low,
    ramFullMiBNominal: full.nominal,
    ramFullMiBHigh: full.high,
  };
}
