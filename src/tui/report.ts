/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type {
  CapacityEstimate,
  CpuEstimate,
  MemoryEstimate,
  WarningCode,
} from "../models/result.js";

const languages = { python: "Python", cpp: "C++", java: "Java" };
const warningMessages: Record<WarningCode, string> = {
  UNVALIDATED_COEFFICIENTS:
    "The coefficients are based on engineering assumptions.",
  CPU_SINGLE_THREAD_RISK: "Sequential processing can limit throughput.",
  CPU_DEMAND_EXCEEDS_ONE_CORE:
    "The nominal CPU estimate reaches or exceeds the capacity of one core.",
  CPU_CONSERVATIVE_DEMAND_EXCEEDS_ONE_CORE:
    "The high CPU estimate reaches or exceeds the capacity of one core.",
  OFFERED_LOAD_EXCEEDS_CAPACITY:
    "The incoming message rate exceeds the estimated throughput of the handler.",
  HIGH_MESSAGE_RATE: "High total message rate.",
  LARGE_MESSAGE_SIZE: "Large message size.",
  LARGE_PUBLISHER_COUNT: "Large publisher count.",
  POTENTIAL_PUBSUB_MESSAGE_LOSS: "PUB/SUB can lose messages.",
  KERNEL_MEMORY_NOT_INCLUDED: "The RAM estimate excludes kernel network buffers.",
  HWM_NOT_HARD_RSS_LIMIT: "Actual RAM use can exceed the estimate at HWM.",
};
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const scientific = new Intl.NumberFormat("en-US", {
  notation: "scientific",
  maximumFractionDigits: 3,
});
const memory = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumber(value: number): string {
  const useScientific = (value > 0 && value < 1e-6) || value >= 1e9;
  return (useScientific ? scientific : decimal).format(value);
}

function formatMemory(value: number): string {
  return (value >= 1e9 ? scientific : whole).format(value);
}

function range(low: number, high: number, format = formatNumber): string {
  const first = format(low);
  const last = format(high);
  return first === last ? first : `${first}–${last}`;
}

export function formatSummary({
  normalizedInput,
  traffic,
  publisher,
  subscriber,
  queue,
}: CapacityEstimate): string {
  return [
    `Total rate  ${formatNumber(traffic.totalMessagesPerSecond)} msg/s`,
    `Payload traffic  ${formatNumber(traffic.payloadMBPerSecond)} MB/s`,
    "",
    `One publisher — ${languages[normalizedInput.publisherLanguage]}`,
    `CPU (one core)  ${range(publisher.cpuPercentLow, publisher.cpuPercentHigh)}%`,
    `Process RAM  ${range(publisher.ramWindowMiBLow, publisher.ramWindowMiBHigh, formatMemory)} MiB`,
    "",
    `Subscriber — ${languages[normalizedInput.subscriberLanguage]}`,
    `CPU (one core)  ${range(subscriber.cpuPercentLow, subscriber.cpuPercentHigh)}%`,
    `RAM (${formatNumber(queue.windowSeconds)} s queue)  ${range(subscriber.ramWindowMiBLow, subscriber.ramWindowMiBHigh, formatMemory)} MiB`,
    `RAM at HWM (${formatNumber(queue.hwm)} msg/peer)`,
    `${range(subscriber.ramFullMiBLow, subscriber.ramFullMiBHigh, formatMemory)} MiB`,
    "",
    "Estimates use assumed coefficients.",
    "RAM excludes OS network buffers.",
  ].join("\n");
}

function scenarios(values: number[], format = formatNumber): string {
  return values.map(format).join(" / ");
}

function processReport(
  title: string,
  estimate: CpuEstimate & MemoryEstimate,
): string[] {
  const {
    cpuMicrosecondsPerMessage,
    cpuCoresLow,
    cpuCoresNominal,
    cpuCoresHigh,
    cpuPercentLow,
    cpuPercentNominal,
    cpuPercentHigh,
    ramWindowMiBLow,
    ramWindowMiBNominal,
    ramWindowMiBHigh,
    ramFullMiBLow,
    ramFullMiBNominal,
    ramFullMiBHigh,
  } = estimate;
  return [
    title,
    `  CPU time per message — ${formatNumber(cpuMicrosecondsPerMessage)} µs`,
    `  CPU, cores — ${scenarios([cpuCoresLow, cpuCoresNominal, cpuCoresHigh])}`,
    `  CPU, % of one core — ${scenarios([cpuPercentLow, cpuPercentNominal, cpuPercentHigh])}`,
    `  RAM for the buffer window, MiB — ${scenarios([ramWindowMiBLow, ramWindowMiBNominal, ramWindowMiBHigh], memory.format)}`,
    `  RAM at HWM, MiB — ${scenarios([ramFullMiBLow, ramFullMiBNominal, ramFullMiBHigh], memory.format)}`,
  ];
}

export function formatDetails({
  normalizedInput,
  traffic,
  publisher,
  subscriber,
  queue,
  metadata,
}: CapacityEstimate): string {
  const window = `${formatNumber(queue.windowSeconds)} s`;
  return [
    "Preliminary ZeroMQ estimate",
    `Model ${metadata.modelVersion}, profiles ${metadata.configVersion}`,
    `Input — ${formatNumber(normalizedInput.publisherCount)} publisher(s), ${formatNumber(normalizedInput.messageBytes)} B, ${formatNumber(normalizedInput.messagesPerSecondPerPublisher)} msg/s per publisher, ${normalizedInput.serialization}`,
    `Total message rate — ${formatNumber(traffic.totalMessagesPerSecond)} msg/s`,
    `Payload traffic — ${formatNumber(traffic.payloadBytesPerSecond)} B/s, ${formatNumber(traffic.payloadMBPerSecond)} MB/s, ${formatNumber(traffic.payloadMbps)} Mbps`,
    "",
    "Estimate order — low / nominal / high",
    ...processReport(
      `One publisher (${languages[normalizedInput.publisherLanguage]})`,
      publisher,
    ),
    ...processReport(
      `One subscriber (${languages[normalizedInput.subscriberLanguage]})`,
      subscriber,
    ),
    "",
    `Subscriber connections — ${formatNumber(subscriber.connectionCount)}`,
    `Queue per connection — ${formatNumber(queue.messagesPerPeerWindow)} msg in ${window}, ${formatNumber(queue.messagesPerPeerFull)} at HWM`,
    `Throughput of one handler — ${formatNumber(subscriber.estimatedSingleThreadCapacityMsgPerSecond)} msg/s`,
    `Unserved messages in ${window} — ${formatNumber(subscriber.estimatedUnservedMessagesInWindow)}`,
    "",
    "Warnings",
    ...metadata.warnings.map((code) => `  ${warningMessages[code]} [${code}]`),
    "",
    "Assumptions",
    ...metadata.assumptions.map((assumption) => `  ${assumption}`),
  ].join("\n");
}
