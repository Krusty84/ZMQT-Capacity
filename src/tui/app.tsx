/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 Alexey Sedoykin
 * SPDX-License-Identifier: MIT
 */

import { readFileSync } from "node:fs";
import {
  Box,
  measureElement,
  Text,
  useApp,
  useBoxMetrics,
  useInput,
  usePaste,
  useWindowSize,
  type DOMElement,
  type Key,
} from "ink";
import { useRef, useState } from "react";
import { estimateCapacity } from "../index.js";
import {
  frequencyUnits,
  messageSizeUnits,
  publisherLanguages,
  serializations,
  subscriberLanguages,
  type CapacityInput,
} from "../models/input.js";
import { useMouse } from "./mouse.js";
import { numericParsers } from "./parse.js";
import { DetailedReport, SummaryReport } from "./report.js";

const { version, license, author } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  version: string;
  license: string;
  author: { name: string };
};
const aboutWidth = 64;
const aboutHeight = 12;

function terminalLink(url: string): string {
  return `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`;
}

const numericLabels = {
  publisherCount: "Publisher count",
  messageSize: "Message size",
  messageFrequency: "Send frequency",
};
const menuOptions = {
  messageSizeUnit: messageSizeUnits,
  frequencyUnit: frequencyUnits,
};
const choiceLabels = {
  B: "B",
  KiB: "KiB",
  MiB: "MiB",
  minute: "Minute",
  second: "Second",
  millisecond: "Millisecond",
  python: "Python — PyZMQ",
  cpp: "C++ — libzmq / cppzmq",
  java: "Java — Spring Boot + JeroMQ",
  json: "JSON",
  protobuf: "Protobuf",
};

const radioChoices = [
  ...serializations.map((value) => ({ field: "serialization" as const, value })),
  ...publisherLanguages.map((value) => ({ field: "publisherLanguage" as const, value })),
  ...subscriberLanguages.map((value) => ({ field: "subscriberLanguage" as const, value })),
].map((choice) => ({ ...choice, id: `${choice.field}:${choice.value}` }));
const focusOrder = [
  "publisherCount",
  "messageSize",
  "messageSizeUnit",
  "messageFrequency",
  "frequencyUnit",
  ...radioChoices.map(({ id }) => id),
  "report",
  "about",
];

type NumericField = keyof typeof numericLabels;
type MenuField = keyof typeof menuOptions;
type Form = Omit<CapacityInput, NumericField> & Record<NumericField, string>;
interface Session {
  form: Form;
  focus: string;
  cursor: number;
  menu?: { field: MenuField; index: number };
  details: boolean;
  scrollTop: number;
  aboutOpen: boolean;
}

const defaultForm: Form = {
  publisherCount: "300",
  messageSize: "1",
  messageSizeUnit: "KiB",
  messageFrequency: "20",
  frequencyUnit: "second",
  publisherLanguage: "python",
  subscriberLanguage: "java",
  serialization: "json",
};
const initialSession: Session = {
  form: defaultForm,
  focus: "publisherCount",
  cursor: defaultForm.publisherCount.length,
  details: false,
  scrollTop: 0,
  aboutOpen: false,
};

function isNumericField(id: string): id is NumericField {
  return Object.hasOwn(numericLabels, id);
}

function focusOn(session: Session, focus: string, cursor?: number): Session {
  return {
    ...session,
    focus,
    cursor: cursor ?? (isNumericField(focus) ? session.form[focus].length : 0),
    menu: undefined,
  };
}

function moveFocus(session: Session, direction: number): Session {
  const index = focusOrder.indexOf(session.focus);
  const next = (index + direction + focusOrder.length) % focusOrder.length;
  return focusOn(session, focusOrder[next]);
}

function updateForm(session: Session, change: Partial<Form>): Session {
  return { ...session, form: { ...session.form, ...change }, scrollTop: 0 };
}

function selectOption(session: Session, field: MenuField, index: number): Session {
  const updated = updateForm(session, { [field]: menuOptions[field][index] });
  return { ...updated, menu: undefined };
}

function activate(session: Session): Session {
  const { focus, form } = session;
  if (focus === "about") return { ...session, aboutOpen: true };
  if (focus === "report") {
    return { ...session, details: !session.details, scrollTop: 0 };
  }
  if (focus === "messageSizeUnit" || focus === "frequencyUnit") {
    const options: readonly string[] = menuOptions[focus];
    return { ...session, menu: { field: focus, index: options.indexOf(form[focus]) } };
  }
  const choice = radioChoices.find(({ id }) => id === focus);
  return choice ? updateForm(session, { [choice.field]: choice.value }) : session;
}

function editNumber(session: Session, field: NumericField, input: string, key?: Key): Session {
  const { cursor } = session;
  const value = session.form[field];
  if (key?.leftArrow) return { ...session, cursor: Math.max(0, cursor - 1) };
  if (key?.rightArrow) return { ...session, cursor: Math.min(value.length, cursor + 1) };
  if (key?.home) return { ...session, cursor: 0 };
  if (key?.end) return { ...session, cursor: value.length };

  let start = cursor;
  let end = cursor;
  if (key?.backspace) {
    start = Math.max(0, cursor - 1);
    input = "";
  } else if (key?.delete) {
    end = Math.min(value.length, cursor + 1);
    input = "";
  } else if (!input || /[^\x20-\x7e]/.test(input)) {
    return session;
  }
  const updated = updateForm(session, {
    [field]: value.slice(0, start) + input + value.slice(end),
  });
  return { ...updated, cursor: start + input.length };
}

function handleKey(session: Session, input: string, key: Key): Session {
  const { focus, menu } = session;
  const direction = key.upArrow ? -1 : key.downArrow ? 1 : 0;
  const confirm = key.return || input === "\r" || input === " ";
  if (session.aboutOpen) {
    return key.escape || confirm ? { ...session, aboutOpen: false } : session;
  }
  if (key.escape && menu) return { ...session, menu: undefined };
  if (key.tab || input === "\t") return moveFocus(session, key.shift ? -1 : 1);
  if (menu) {
    if (confirm) return selectOption(session, menu.field, menu.index);
    const lastIndex = menuOptions[menu.field].length - 1;
    const index = Math.max(0, Math.min(menu.index + direction, lastIndex));
    return { ...session, menu: { ...menu, index } };
  }
  if (direction) return moveFocus(session, direction);
  if (confirm && !isNumericField(focus)) return activate(session);
  return isNumericField(focus) ? editNumber(session, focus, input, key) : session;
}

function renderResult({ form, details }: Session, width: number) {
  const estimate = estimateCapacity({
    ...form,
    publisherCount: numericParsers.publisherCount(form.publisherCount.trim()),
    messageSize: numericParsers.messageSize(form.messageSize.trim()),
    messageFrequency: numericParsers.messageFrequency(form.messageFrequency.trim()),
  });
  if (estimate.ok) {
    const Report = details ? DetailedReport : SummaryReport;
    return <Report result={estimate.result} width={width} />;
  }
  const { field, message } = estimate.error;
  const label = isNumericField(field) ? numericLabels[field] : `Calculation error (${field})`;
  return <Text>{`${label}\n${message}`}</Text>;
}

const optionPrefix = "option:";
const fieldMarkerWidth = 2;

function visibleStart(cursor: number, width: number): number {
  return Math.max(0, cursor - width + fieldMarkerWidth + 1);
}

export function App() {
  const [session, setSession] = useState(initialSession);
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();
  const fits = columns >= 80 && rows >= 24;
  // Reserve one row for the footer and one for Ink's trailing newline.
  const panelHeight = rows - 2;
  const pageHeight = panelHeight - 4;
  const targets = useRef(new Map<string, DOMElement>());
  const viewport = useRef<DOMElement>(null);
  const report = useRef<DOMElement>(null);
  const closeAbout = useRef<DOMElement>(null);
  const { height: reportHeight } = useBoxMetrics(report);
  const maxScroll = Math.max(0, reportHeight - pageHeight);
  const scrollTop = Math.min(session.scrollTop, maxScroll);

  function scrollBy(amount: number) {
    setSession((current) => {
      if (current.aboutOpen || maxScroll === 0) return current;
      const top = Math.min(current.scrollTop, maxScroll);
      return { ...current, scrollTop: Math.max(0, Math.min(top + amount, maxScroll)) };
    });
  }

  useInput((input, key) => {
    if (key.eventType === "release") return;
    if (key.ctrl && input === "c") {
      exit(130);
      return;
    }
    if (!fits || key.ctrl || key.meta || key.super || key.hyper) return;
    if (key.pageUp || key.pageDown) {
      scrollBy(key.pageUp ? -pageHeight : pageHeight);
      return;
    }
    // Ink can deliver consecutive Tab and Enter presses in one text chunk.
    const parts = input.length > 1 ? input.split(/([\t\r])/) : [input];
    setSession((current) =>
      parts.reduce((next, part) => handleKey(next, part, key), current),
    );
  });
  usePaste((input) => {
    if (!fits) return;
    setSession((current) => !current.aboutOpen && isNumericField(current.focus)
      ? editNumber(current, current.focus, input.trim())
      : current);
  });
  useMouse(({ action, x, y }) => {
    if (!fits) return;
    const contains = (area: ReturnType<typeof measureElement>) =>
      x >= area.x && x < area.x + area.width &&
      y >= area.y && y < area.y + area.height;

    if (session.aboutOpen) {
      const button = closeAbout.current;
      if (action === "click" && button && contains(measureElement(button))) {
        setSession((current) => ({ ...current, aboutOpen: false }));
      }
      return;
    }
    if (action !== "click") {
      if (viewport.current && contains(measureElement(viewport.current))) {
        scrollBy(action === "scrollUp" ? -3 : 3);
      }
      return;
    }
    for (const [id, node] of targets.current) {
      const area = measureElement(node);
      if (!contains(area)) continue;

      setSession((current) => {
        if (current.aboutOpen) return current;
        if (id.startsWith(optionPrefix)) {
          return current.menu
            ? selectOption(current, current.menu.field, Number(id.slice(optionPrefix.length)))
            : current;
        }
        if (isNumericField(id)) {
          const value = current.form[id];
          const caret = current.focus === id ? current.cursor : value.length;
          const start = visibleStart(caret, area.width);
          const cursor = Math.min(value.length, start + Math.max(0, x - area.x - fieldMarkerWidth));
          return focusOn(current, id, y === area.y ? value.length : cursor);
        }
        if (current.menu?.field === id) return { ...current, menu: undefined };
        return activate(focusOn(current, id));
      });
      return;
    }
    setSession((current) => current.menu ? { ...current, menu: undefined } : current);
  });

  if (!fits) {
    return <Text>Enlarge the terminal to at least 80 columns and 24 rows. Ctrl+C to exit.</Text>;
  }

  const formWidth = Math.floor((columns - 1) / 2);
  const resultsWidth = columns - formWidth - 1;
  const contentWidth = formWidth - 4;
  const numberWidth = Math.floor((contentWidth - 1) / 2);
  const menuWidth = contentWidth - numberWidth - 1;
  const marker = (id: string) => !session.aboutOpen && session.focus === id ? "> " : "  ";

  function target(id: string) {
    return (node: DOMElement | null) => {
      if (node) targets.current.set(id, node);
      else targets.current.delete(id);
    };
  }

  function numberField(id: NumericField, width: number) {
    const value = session.form[id];
    const focused = session.focus === id;
    const cursor = focused ? session.cursor : value.length;
    const start = visibleStart(cursor, width);
    const end = start + width - fieldMarkerWidth;
    return (
      <Box ref={target(id)} flexDirection="column" width={width}>
        <Text bold={focused}>{numericLabels[id]}</Text>
        <Text wrap="truncate-end">
          {marker(id)}
          {focused ? (
            <>
              {value.slice(start, cursor)}
              <Text inverse>{value[cursor] ?? " "}</Text>
              {value.slice(cursor + 1, end)}
            </>
          ) : value.slice(start, end)}
        </Text>
      </Box>
    );
  }

  function menuField(id: MenuField, label: string) {
    const menu = session.menu?.field === id ? session.menu : undefined;
    return (
      <Box flexDirection="column" width={menuWidth}>
        <Box ref={target(id)} flexDirection="column">
          <Text bold={session.focus === id}>{label}</Text>
          <Text>{marker(id)}{choiceLabels[session.form[id]]} {menu ? "▴" : "▾"}</Text>
        </Box>
        {menu && menuOptions[id].map((value, index) => (
          <Box key={value} ref={target(`${optionPrefix}${index}`)}>
            <Text inverse={menu.index === index}>
              {menu.index === index ? "> " : "  "}{choiceLabels[value]}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  function radioGroup(field: (typeof radioChoices)[number]["field"], label: string) {
    const inline = field === "serialization";
    return (
      <Box flexDirection="column">
        <Text>{label}</Text>
        <Box flexDirection={inline ? "row" : "column"} gap={inline ? 1 : 0}>
          {radioChoices.filter((choice) => choice.field === field).map(({ id, value }) => (
            <Box key={id} ref={target(id)}>
              <Text bold={session.focus === id}>
                {marker(id)}{session.form[field] === value ? "(o)" : "( )"} {choiceLabels[value]}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows - 1}>
      <Box height={panelHeight} flexShrink={0} gap={1}>
        <Box
          flexDirection="column"
          borderStyle="round"
          paddingX={1}
          width={formWidth}
          flexShrink={0}
        >
          <Box marginBottom={rows === 24 && session.menu ? 0 : 1}>
            <Text bold>Initial values</Text>
          </Box>
          {numberField("publisherCount", contentWidth)}
          <Box gap={1}>
            {numberField("messageSize", numberWidth)}
            {menuField("messageSizeUnit", "Size unit")}
          </Box>
          <Box gap={1}>
            {numberField("messageFrequency", numberWidth)}
            {menuField("frequencyUnit", "Period")}
          </Box>
          {radioGroup("serialization", "Message format")}
          {radioGroup("publisherLanguage", "Publisher language")}
          <Box height={1} flexShrink={0} />
          {radioGroup("subscriberLanguage", "Subscriber language")}
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          paddingX={1}
          width={resultsWidth}
          flexShrink={0}
        >
          <Box gap={1} height={1} marginBottom={1} flexShrink={0}>
            <Text bold>Estimated results</Text>
            <Box ref={target("report")}>
              <Text bold={session.focus === "report"}>
                {marker("report")}[{session.details ? "Summary" : "Details"}]
              </Text>
            </Box>
          </Box>
          <Box
            ref={viewport}
            flexDirection="column"
            height={pageHeight}
            flexShrink={0}
            overflow="hidden"
            contentOffsetY={scrollTop}
          >
            <Box ref={report} flexDirection="column" flexShrink={0}>
              {renderResult(session, resultsWidth - 4)}
            </Box>
          </Box>
        </Box>
      </Box>
      <Box justifyContent="space-between" gap={1} height={1} flexShrink={0}>
        <Text wrap="truncate-end">
          ↑↓ Tab Move  ←→ Edit  Enter Select  Esc Close  PgUp/PgDn  Ctrl+C Exit
        </Text>
        <Box ref={target("about")} flexShrink={0}>
          <Text bold={!session.aboutOpen && session.focus === "about"}>
            {marker("about")}[About]
          </Text>
        </Box>
      </Box>
      {session.aboutOpen && (
        <Box
          position="absolute"
          left={Math.floor((columns - aboutWidth) / 2)}
          top={Math.floor((panelHeight - aboutHeight) / 2)}
          width={aboutWidth}
          height={aboutHeight}
          flexDirection="column"
          borderStyle="round"
          backgroundColor="black"
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text bold color="white">About</Text>
          </Box>
          <Text color="white">ZMQT-Capacity {version}</Text>
          <Text color="white">License {license}</Text>
          <Text color="white">Author: {author.name}</Text>
          <Text color="white">Contact|Support:</Text>
          <Text color="white" underline>
            {terminalLink("https://www.linkedin.com/in/sedoykin")}
          </Text>
          <Text color="white" underline>
            {terminalLink("https://github.com/Krusty84")}
          </Text>
          <Text color="white" bold>Warning: Estimates are approximate and for guidance only.</Text>
          <Box ref={closeAbout} alignSelf="flex-end">
            <Text bold color="white">&gt; [Close]</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
