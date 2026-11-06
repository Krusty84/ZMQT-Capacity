/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { expect, test, vi } from "vitest";
import { estimateCapacity } from "../index.js";
import { referenceInput } from "./fixtures.js";

vi.mock("../profiles/settings.json", async (importOriginal) => {
  const { default: settings } = await importOriginal<{
    default: typeof import("../profiles/settings.json");
  }>();
  return { default: { ...settings, configVersion: "2.0.0" } };
});

test("reports an incompatible configuration version as a structured error", () => {
  expect(estimateCapacity(referenceInput)).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_CONFIG_VERSION",
      field: "configVersion",
      message: expect.any(String),
    },
  });
});
