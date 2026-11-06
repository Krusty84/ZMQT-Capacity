/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

// Ref ../../ARCHITECTURE.md#input-and-units
// 1 KiB = 1024 B, 1 MiB = 1024² B = 1 048 576 B, 1 MB = 1 000 000 B.
export const BYTES_PER_KIB = 1024;
export const BYTES_PER_MIB = BYTES_PER_KIB ** 2;
export const BYTES_PER_MB = 1_000_000;
export const MICROSECONDS_PER_SECOND = 1_000_000;
