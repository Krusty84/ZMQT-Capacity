/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { Box, Text } from "ink";
import { Fragment } from "react";
import type {
  CapacityEstimate,
  CpuEstimate,
  MemoryEstimate,
  WarningCode,
} from "../models/result.js";
import { settings } from "../profiles/config.js";

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

const minMetricWidth = 10;
type MetricLabel = { full: string; compact: string };
type Cells = readonly [string | MetricLabel, string, ...string[]];
type TableProps = {
  width: number;
  rows: readonly Cells[];
  headers?: Cells;
  columnWidths?: readonly number[];
};

function metricLabelVariant(rows: readonly Cells[], width: number): keyof MetricLabel {
  const fullFits = rows.every(([label]) => typeof label === "string" || label.full.length <= width);
  return fullFits ? "full" : "compact";
}

function Table({ width, rows, headers = ["Metric", "Estimate"], columnWidths }: TableProps) {
  const contentWidth = width - headers.length - 1;
  const widestEstimate = rows.reduce(
    (longest, row) => Math.max(longest, row[1].length),
    headers[1].length,
  );
  const estimateWidth = Math.min(widestEstimate, contentWidth - minMetricWidth);
  const widths = columnWidths ?? [contentWidth - estimateWidth, estimateWidth];
  const labelVariant = metricLabelVariant(rows, widths[0]);
  const rules = widths.map((size) => "─".repeat(size));
  const divider = `├${rules.join("┼")}┤`;

  function renderRow(cells: Cells, bold = false) {
    return (
      <Box flexShrink={0}>
        {cells.map((cell, index) => (
          <Box
            key={index}
            width={widths[index] + (index === 0 ? 2 : 1)}
            flexShrink={0}
            justifyContent={index === 0 ? "flex-start" : "flex-end"}
            borderStyle="single"
            borderTop={false}
            borderBottom={false}
            borderLeft={index === 0}
          >
            <Text bold={bold}>{typeof cell === "string" ? cell : cell[labelVariant]}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box width={width} flexDirection="column" flexShrink={0}>
      <Text>{`┌${rules.join("┬")}┐`}</Text>
      {renderRow(headers, true)}
      {rows.map((row, index) => (
        <Fragment key={index}>
          <Text>{divider}</Text>
          {renderRow(row)}
        </Fragment>
      ))}
      <Text>{`└${rules.join("┴")}┘`}</Text>
    </Box>
  );
}

type ReportProps = { result: CapacityEstimate; width: number };

const scenarios = ["Low", "Nominal", "High"] as const;
const scenarioHeaders = ["Metric", ...scenarios] as const;

function processRows(estimate: CpuEstimate & MemoryEstimate, window: string) {
  return [
    [
      { full: "CPU load in logical cores", compact: "CPU, cores" },
      formatNumber(estimate.cpuCoresLow),
      formatNumber(estimate.cpuCoresNominal),
      formatNumber(estimate.cpuCoresHigh),
    ],
    [
      { full: "CPU load, % of one logical core", compact: "CPU, % core" },
      formatNumber(estimate.cpuPercentLow),
      formatNumber(estimate.cpuPercentNominal),
      formatNumber(estimate.cpuPercentHigh),
    ],
    [
      { full: `RAM for a ${window} buffer window, MiB`, compact: `RAM ${window}, MiB` },
      memory.format(estimate.ramWindowMiBLow),
      memory.format(estimate.ramWindowMiBNominal),
      memory.format(estimate.ramWindowMiBHigh),
    ],
    [
      { full: "RAM with queues at HWM, MiB", compact: "RAM HWM, MiB" },
      memory.format(estimate.ramFullMiBLow),
      memory.format(estimate.ramFullMiBNominal),
      memory.format(estimate.ramFullMiBHigh),
    ],
  ] as const;
}

export function SummaryReport({ result, width }: ReportProps) {
  const { normalizedInput, traffic, publisher, subscriber, queue } = result;
  const window = `${formatNumber(queue.windowSeconds)} s`;
  const trafficHeaders = ["msg/s", "MB/s", "Mbps"] as const;
  const trafficContentWidth = width - trafficHeaders.length - 1;
  const trafficColumnWidth = Math.floor(trafficContentWidth / trafficHeaders.length);
  const trafficColumnWidths = [
    trafficColumnWidth + trafficContentWidth % trafficHeaders.length,
    trafficColumnWidth,
    trafficColumnWidth,
  ];

  function renderProcess(title: string, estimate: CpuEstimate & MemoryEstimate) {
    const time = `${formatNumber(estimate.cpuMicrosecondsPerMessage)} µs`;
    const rows = processRows(estimate, window);
    const valueWidths = scenarios.map((heading, index) =>
      Math.max(heading.length, ...rows.map(([, ...values]) => values[index].length)),
    );
    const metricWidth = width - scenarioHeaders.length - 1 - valueWidths.reduce((total, value) => total + value, 0);
    const headingVariant = metricLabelVariant(rows, width);

    return (
      <Box flexDirection="column">
        <Text bold>{title}</Text>
        <Table width={width} rows={[[{ full: "CPU time per message", compact: "CPU time/msg" }, time]]} />
        {metricWidth >= minMetricWidth ? (
          <Table width={width} headers={scenarioHeaders} rows={rows} columnWidths={[metricWidth, ...valueWidths]} />
        ) : (
          rows.map(([metric, ...values]) => (
            <Box key={metric.full} flexDirection="column">
              <Text bold>{metric[headingVariant]}</Text>
              <Table
                width={width}
                headers={["Scenario", "Estimate"]}
                rows={scenarios.map((scenario, index) => [scenario, values[index]])}
              />
            </Box>
          ))
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {renderProcess(`Subscriber — ${languages[normalizedInput.subscriberLanguage]}`, subscriber)}
      <Box flexDirection="column">
        <Text bold>Subscriber capacity</Text>
        <Table width={width} rows={[
          [
            { full: "Subscriber connections", compact: "Connections" },
            formatNumber(subscriber.connectionCount),
          ],
          [
            { full: "Queued messages per connection", compact: "Queue per peer" },
            `${formatNumber(queue.messagesPerPeerWindow)} msg in ${window}`,
          ],
          [
            { full: "Messages per connection at HWM", compact: "Queue at HWM" },
            `${formatNumber(queue.messagesPerPeerFull)} msg/peer`,
          ],
          [
            { full: "Throughput of one handler", compact: "Handler limit" },
            `${formatNumber(subscriber.estimatedSingleThreadCapacityMsgPerSecond)} msg/s`,
          ],
          [
            { full: `Unserved messages in ${window}`, compact: `Unserved in ${window}` },
            formatNumber(subscriber.estimatedUnservedMessagesInWindow),
          ],
        ]} />
      </Box>
      {renderProcess(`One publisher — ${languages[normalizedInput.publisherLanguage]}`, publisher)}
      <Box flexDirection="column">
        <Text bold>Traffic</Text>
        <Table
          width={width}
          headers={trafficHeaders}
          columnWidths={trafficColumnWidths}
          rows={[[
            formatNumber(traffic.totalMessagesPerSecond),
            formatNumber(traffic.payloadMBPerSecond),
            formatNumber(traffic.payloadMbps),
          ]]}
        />
      </Box>
      <Text>
        {`Input — ${formatNumber(normalizedInput.publisherCount)} publisher(s), ${formatNumber(normalizedInput.messageBytes)} B, ${formatNumber(normalizedInput.messagesPerSecondPerPublisher)} msg/s per publisher, ${normalizedInput.serialization}`}
      </Text>
    </Box>
  );
}

export function ExplanationsReport({ metadata }: { metadata: CapacityEstimate["metadata"] }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>Preliminary ZeroMQ estimate</Text>
        <Text>{`Model ${metadata.modelVersion}, profiles ${metadata.configVersion}`}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>Scenarios</Text>
        <Text>
          CPU cores = msg/s × µs per message / 1,000,000.
          Multiply by {settings.cpuOptimisticFactor} for Low, {settings.cpuNominalFactor} for Nominal,
          and {settings.cpuConservativeFactor} for High. CPU percent = cores × 100.
        </Text>
        <Text>
          RAM adds base, connection, and queue memory using Low or High profile values.
          At each queue depth, Nominal = (Low + High) / 2.
        </Text>
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
