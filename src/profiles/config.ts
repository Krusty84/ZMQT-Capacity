/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import type {
  PublisherLanguage,
  Serialization,
  SubscriberLanguage,
} from "../models/input.js";
import publisher from "./publisher.json" with { type: "json" };
import settings from "./settings.json" with { type: "json" };
import subscriber from "./subscriber.json" with { type: "json" };

export interface CpuCoefficients {
  a: number;
  b: number;
}

interface Range {
  low: number;
  high: number;
}

export interface ImplementationProfile {
  cpu: Record<Serialization, CpuCoefficients>;
  baseMiB: Range;
  connectionKiB: Range;
  messageOverheadBytes: Range;
}

export const profiles = {
  publisher: publisher satisfies Record<
    PublisherLanguage,
    ImplementationProfile
  >,
  subscriber: subscriber satisfies Record<
    SubscriberLanguage,
    ImplementationProfile
  >,
};

export { settings };
