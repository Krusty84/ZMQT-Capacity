/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

function parseDecimal(answer: string): number | undefined {
  const match = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))(?:e[+-]?\d+)?$/i.exec(
    answer,
  );
  if (!match) return undefined;

  const value = Number(answer.replace(",", "."));
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(match[1])))
    return undefined;
  return value;
}

export const numericParsers = {
  publisherCount(answer: string): number | undefined {
    const value = Number(answer);
    return /^\d+$/.test(answer) && Number.isSafeInteger(value) && value > 0
      ? value
      : undefined;
  },
  messageSize(answer: string): number | undefined {
    const value = parseDecimal(answer);
    return value !== undefined && value > 0 ? value : undefined;
  },
  messageFrequency(answer: string): number | undefined {
    const value = parseDecimal(answer);
    return value !== undefined && value >= 0 ? value : undefined;
  },
};
