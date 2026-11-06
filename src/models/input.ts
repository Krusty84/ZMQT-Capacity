/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

export const messageSizeUnits = ["B", "KiB", "MiB"] as const;
export const frequencyUnits = ["minute", "second", "millisecond"] as const;
export const publisherLanguages = ["python", "cpp"] as const;
export const subscriberLanguages = ["java", "python", "cpp"] as const;
export const serializations = ["json", "protobuf"] as const;

export type MessageSizeUnit = (typeof messageSizeUnits)[number];
export type FrequencyUnit = (typeof frequencyUnits)[number];
export type PublisherLanguage = (typeof publisherLanguages)[number];
export type SubscriberLanguage = (typeof subscriberLanguages)[number];
export type Serialization = (typeof serializations)[number];

export interface CapacityInput {
  publisherCount: number;
  messageSize: number;
  messageSizeUnit: MessageSizeUnit;
  messageFrequency: number;
  frequencyUnit: FrequencyUnit;
  publisherLanguage: PublisherLanguage;
  subscriberLanguage: SubscriberLanguage;
  serialization: Serialization;
}

export interface NormalizedInput {
  publisherCount: number;
  messageBytes: number;
  messagesPerSecondPerPublisher: number;
  publisherLanguage: PublisherLanguage;
  subscriberLanguage: SubscriberLanguage;
  serialization: Serialization;
}
