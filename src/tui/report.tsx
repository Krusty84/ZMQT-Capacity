/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { Box, Text } from "ink";
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

type Cells = readonly [string, string, ...string[]];
type TableProps = {
  width: number;
  rows: readonly (string | Cells)[];
  headers?: Cells;
  columnWidths?: readonly number[];
};

function Table({ width, rows, headers = ["Metric", "Estimate"], columnWidths }: TableProps) {
  const widestEstimate = rows.reduce(
    (longest, row) => typeof row === "string" ? longest : Math.max(longest, row[1].length),
    headers[1].length,
  );
  const estimateWidth = Math.min(widestEstimate, width - 11);
  const widths = columnWidths ?? [width - estimateWidth - 1, estimateWidth];

  function renderRow(cells: Cells, key: number | string, bold = false) {
    // Give an estimate its own line if it cannot fit beside its label.
    const fullWidth = cells.length === 2 && cells[1].length > widths[1];
    return (
      <Box key={key} columnGap={1} flexWrap="wrap" flexShrink={0}>
        {cells.map((cell, index) => (
          <Box
            key={index}
            width={fullWidth ? width : widths[index]}
            flexShrink={0}
            justifyContent={index === 0 ? "flex-start" : "flex-end"}
          >
            <Text bold={bold}>{cell}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box width={width} flexDirection="column" flexShrink={0}>
      {renderRow(headers, "header", true)}
      <Text dimColor>{"─".repeat(width)}</Text>
      {rows.map((row, index) =>
        typeof row === "string" ? <Text key={index} bold>{row}</Text> : renderRow(row, index),
      )}
    </Box>
  );
}

type ReportProps = { result: CapacityEstimate; width: number };

function trafficRows(traffic: CapacityEstimate["traffic"]): Cells[] {
  return [
    ["Total rate", `${formatNumber(traffic.totalMessagesPerSecond)} msg/s`],
    ["Payload traffic", `${formatNumber(traffic.payloadMBPerSecond)} MB/s`],
  ];
}

export function SummaryReport({ result, width }: ReportProps) {
  const { normalizedInput, traffic, publisher, subscriber, queue } = result;
  return (
    <Box flexDirection="column" gap={1}>
      <Table width={width} rows={[
        "Traffic",
        ...trafficRows(traffic),
        `One publisher — ${languages[normalizedInput.publisherLanguage]}`,
        ["CPU (one core)", `${range(publisher.cpuPercentLow, publisher.cpuPercentHigh)}%`],
        ["Process RAM", `${range(publisher.ramWindowMiBLow, publisher.ramWindowMiBHigh, formatMemory)} MiB`],
        `Subscriber — ${languages[normalizedInput.subscriberLanguage]}`,
        ["CPU (one core)", `${range(subscriber.cpuPercentLow, subscriber.cpuPercentHigh)}%`],
        [
          `RAM (${formatNumber(queue.windowSeconds)} s queue)`,
          `${range(subscriber.ramWindowMiBLow, subscriber.ramWindowMiBHigh, formatMemory)} MiB`,
        ],
        [
          `RAM at HWM (${formatNumber(queue.hwm)} msg/peer)`,
          `${range(subscriber.ramFullMiBLow, subscriber.ramFullMiBHigh, formatMemory)} MiB`,
        ],
      ]} />
      <Text>{"Estimates use assumed coefficients.\nRAM excludes OS network buffers."}</Text>
    </Box>
  );
}

const scenarios = ["Low", "Nominal", "High"] as const;
const scenarioHeaders = ["Metric", ...scenarios] as const;

function processRows(estimate: CpuEstimate & MemoryEstimate, window: string) {
  return [
    [
      "CPU, cores",
      formatNumber(estimate.cpuCoresLow),
      formatNumber(estimate.cpuCoresNominal),
      formatNumber(estimate.cpuCoresHigh),
    ],
    [
      "CPU, % of one core",
      formatNumber(estimate.cpuPercentLow),
      formatNumber(estimate.cpuPercentNominal),
      formatNumber(estimate.cpuPercentHigh),
    ],
    [
      `RAM (${window} queue), MiB`,
      memory.format(estimate.ramWindowMiBLow),
      memory.format(estimate.ramWindowMiBNominal),
      memory.format(estimate.ramWindowMiBHigh),
    ],
    [
      "RAM at HWM, MiB",
      memory.format(estimate.ramFullMiBLow),
      memory.format(estimate.ramFullMiBNominal),
      memory.format(estimate.ramFullMiBHigh),
    ],
  ] as const;
}

export function DetailedReport({ result, width }: ReportProps) {
  const { normalizedInput, traffic, publisher, subscriber, queue, metadata } = result;
  const window = `${formatNumber(queue.windowSeconds)} s`;
  const processes = [
    { title: `One publisher — ${languages[normalizedInput.publisherLanguage]}`, estimate: publisher },
    { title: `Subscriber — ${languages[normalizedInput.subscriberLanguage]}`, estimate: subscriber },
  ].map(({ title, estimate }) => ({
    title,
    time: `${formatNumber(estimate.cpuMicrosecondsPerMessage)} µs`,
    rows: processRows(estimate, window),
  }));
  const scenarioRows = processes.flatMap(({ rows }) => rows);
  const valueWidths = scenarios.map((heading, index) =>
    Math.max(heading.length, ...scenarioRows.map((row) => row[index + 1].length)),
  );
  const metricWidth = width - valueWidths.reduce((total, value) => total + value, 0) - scenarios.length;
  const columnWidths = [metricWidth, ...valueWidths];

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>Preliminary ZeroMQ estimate</Text>
        <Text>{`Model ${metadata.modelVersion}, profiles ${metadata.configVersion}`}</Text>
        <Text>
          {`Input — ${formatNumber(normalizedInput.publisherCount)} publisher(s), ${formatNumber(normalizedInput.messageBytes)} B, ${formatNumber(normalizedInput.messagesPerSecondPerPublisher)} msg/s per publisher, ${normalizedInput.serialization}`}
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Traffic</Text>
        <Table width={width} rows={[
          ...trafficRows(traffic),
          ["Payload traffic", `${formatNumber(traffic.payloadBytesPerSecond)} B/s`],
          ["Payload traffic", `${formatNumber(traffic.payloadMbps)} Mbps`],
        ]} />
      </Box>
      {processes.map(({ title, time, rows }) => (
        <Box key={title} flexDirection="column">
          <Text bold>{title}</Text>
          <Table width={width} rows={[["CPU time per message", time]]} />
          {metricWidth >= 16 ? (
            <Table width={width} headers={scenarioHeaders} rows={rows} columnWidths={columnWidths} />
          ) : (
            rows.map(([metric, ...values]) => (
              <Box key={metric} flexDirection="column">
                <Text bold>{metric}</Text>
                <Table
                  width={width}
                  headers={["Scenario", "Estimate"]}
                  rows={scenarios.map((scenario, index) => [scenario, values[index]])}
                />
              </Box>
            ))
          )}
        </Box>
      ))}
      <Box flexDirection="column">
        <Text bold>Subscriber capacity</Text>
        <Table width={width} rows={[
          ["Subscriber connections", formatNumber(subscriber.connectionCount)],
          ["Queue per connection", `${formatNumber(queue.messagesPerPeerWindow)} msg in ${window}`],
          ["Queue at HWM", `${formatNumber(queue.messagesPerPeerFull)} msg/peer`],
          ["Throughput of one handler", `${formatNumber(subscriber.estimatedSingleThreadCapacityMsgPerSecond)} msg/s`],
          [`Unserved messages in ${window}`, formatNumber(subscriber.estimatedUnservedMessagesInWindow)],
        ]} />
      </Box>
      <Box flexDirection="column">
        <Text bold>Warnings</Text>
        <Text>{metadata.warnings.map((code) => `${warningMessages[code]} [${code}]`).join("\n")}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Assumptions</Text>
        <Text>{metadata.assumptions.join("\n")}</Text>
      </Box>
    </Box>
  );
}
