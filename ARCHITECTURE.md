# ZMQT-Capacity architecture

## Overview

ZMQT-Capacity estimates CPU work, resident process memory, and payload traffic for ZeroMQ PUB/SUB. The model follows calculation specification 1.0 of 6 November 2026. It uses engineering coefficients for preliminary capacity estimates.

`N` identical publisher processes send messages over TCP/IP to one subscriber process. Each publisher has one connection. Each message contains one serialized frame. The publishers use the same size, rate, language, and format in one estimate. The model uses steady-state traffic and separate queue scenarios. It counts connections independently of OS threads.

## Components and dependencies

| Component | Function |
| --- | --- |
| [Library entry point](src/index.ts) | `estimateCapacity` selects profiles, calls the estimators, and assembles the result. |
| [CLI](src/cli) | The wizard reads values with Node.js `readline`. It writes prompts and errors to stderr and the report to stdout. |
| [Calculation core](src/core) | Converts units and estimates traffic, CPU, queue depth, RAM, and overload. |
| [Profiles](src/profiles) | JSON files hold CPU coefficients, RAM ranges, and model settings. |
| [Types](src/models) and [validation](src/validation) | Define the API and check inputs, configuration versions, and numeric ranges. |
| [Tests](src/tests) | Cover formulas, properties, limits, reference values, and CLI behavior. |

The runtime needs Node.js 24. TypeScript, Node.js types, Vitest, and fast-check support builds and tests. The library and CLI run offline. The ZeroMQ implementations in the profile tables identify the systems that the tool models. The calculation uses arithmetic in place of sockets or hardware measurements.

## Data flow and API

1. Pass the inputs to `estimateCapacity`. It validates the inputs, converts size to bytes and rate to messages per second, and checks the configuration version.
2. Select one profile per role. Select CPU coefficients for the serialization format.
3. Calculate total rate and payload traffic, CPU work for both roles, both queue depths, and RAM for both roles. Compare the offered rate with the subscriber capacity and add warnings.
4. Return the result with its assumptions and versions. The CLI formats the result and rounds RAM to two decimal places. The API uses unrounded values.

[`CapacityResult`](src/models/result.ts) contains `{ ok: true, result }` or `{ ok: false, error }`. The error contains `code`, `field`, and `message`. The result has these sections.

| Section | Data |
| --- | --- |
| `normalizedInput` | `publisherCount`, `messageBytes`, `messagesPerSecondPerPublisher`, `publisherLanguage`, `subscriberLanguage`, `serialization`. |
| `traffic` | `totalMessagesPerSecond`, `payloadBytesPerSecond`, `payloadMBPerSecond`, `payloadMbps`. |
| `publisher` | CPU time per message (`cpuMicrosecondsPerMessage`). CPU cores, CPU percent, and RAM for both queue scenarios (`cpuCores*`, `cpuPercent*`, `ramWindowMiB*`, `ramFullMiB*`). The suffixes are `Low`, `Nominal`, and `High`. |
| `subscriber` | The same CPU and RAM fields for the subscriber, plus `connectionCount`, `estimatedSingleThreadCapacityMsgPerSecond`, `estimatedUnservedMessagesInWindow`, and `cpuSingleThreadRisk`. |
| `queue` | `hwm`, `windowSeconds`, `messagesPerPeerWindow`, `messagesPerPeerFull`. |
| `metadata` | `modelVersion`, `configVersion`, `estimationMethod` (`heuristic`), `preliminary` (`true`), `assumptions`, and machine-readable `warnings`. |

The CLI runs one estimate per session. Exit codes are `0` for success or help, `1` for a calculation error, `2` for an invalid argument or incomplete input, and `130` for Ctrl+C.

## Input and units

All fields in [`CapacityInput`](src/models/input.ts) are required.

| Field | Rule |
| --- | --- |
| `publisherCount` | Integer of at least 1. |
| `messageSize` | Positive finite number. Use the size after serialization. |
| `messageSizeUnit` | `B`, `KiB`, or `MiB`. |
| `messageFrequency` | Finite number of messages per period from one publisher, at least 0. Fractional rates are valid. |
| `frequencyUnit` | `minute`, `second`, or `millisecond`. |
| `publisherLanguage` | `python` or `cpp`. |
| `subscriberLanguage` | `java`, `python`, or `cpp`. |
| `serialization` | `json` or `protobuf`. The format selects CPU coefficients. The supplied payload size applies to either format. |

```text
S = messageSize × sizeMultiplier
S_kib = S / 1024
f = messageFrequency × frequencyMultiplier
```

`S` is the size in bytes. `S_kib` is the size in KiB. `f` is the rate of one publisher in msg/s. [Normalization](src/core/normalize.ts), [unit constants](src/core/units.ts).

| Input unit | Multiplier | Output unit |
| --- | ---: | --- |
| `B` | 1 | B |
| `KiB` | 1024 | B |
| `MiB` | 1048576 | B |
| `minute` | 1/60 | msg/s |
| `second` | 1 | msg/s |
| `millisecond` | 1000 | msg/s |

`1 KiB = 1024 B`. `1 MiB = 1024² B = 1048576 B`. `1 MB = 1000000 B`. `1 B = 8 bits`. `1 s = 1000000 µs`.

After conversion, the size must be a positive whole number of bytes. Keep calculated values finite. Use positive divisors and nonnegative CPU and RAM values. Zero frequency gives zero traffic and zero message-related CPU work. Round for display only. The queue ceiling is part of the queue formula.

The implementation limits the publisher count and size in bytes to `Number.MAX_SAFE_INTEGER`. It returns `INVALID_INPUT` for invalid fields, `NUMERIC_RANGE` when a size or calculation falls outside the numeric range, and `INVALID_CONFIG_VERSION` for an unsupported configuration version. A positive value that falls to zero during a checked conversion also gives `NUMERIC_RANGE`.

## Payload traffic

```text
R = N × f                         (msg/s)
B_payload = R × S                 (B/s)
B_MBps = B_payload / 1000000      (MB/s)
B_Mbps = 8 × B_payload / 1000000  (Mbps)
```

The traffic estimate covers the offered payload. Full wire traffic needs a separate model for Ethernet/IP/TCP headers, ZMTP framing, TCP acknowledgments, retransmissions, fragmentation, packetization, encryption, compression, and extra topic frames. Protocol overhead varies with message size. [Traffic estimator](src/core/traffic.ts).

## CPU model

`t_msg` is CPU time per message in µs. `a` is the fixed cost in µs/message. `b` is the cost per KiB in µs/KiB. `t_pub` covers serialization and send. `t_sub` covers receive and deserialization.

```text
t_msg = a + b × S_kib
C_pub = f × t_pub / 1000000
C_sub = R × t_sub / 1000000
C_low = 0.5 × C
C_nominal = 1.0 × C
C_high = 3.0 × C
CPU_percent = 100 × C_scenario
```

`C` is the work in equivalent logical cores for one publisher or the subscriber. The code divides the message rate by `1000000 / t_msg`. Values of `0.25` and `1.5` mean work equal to 25% and 150% of one logical core. Actual use of multiple cores depends on the application. [Model settings](#model-settings), [CPU estimator](src/core/cpu.ts).

The specification also defines the optional fleet metric `C_pub_all = N × C_pub`. It sums CPU work across all sender processes. The API reports CPU for one publisher.

## CPU profiles

The role, language, and format select the coefficients. [Publisher profiles](src/profiles/publisher.json), [subscriber profiles](src/profiles/subscriber.json).

| Role | Language and implementation | JSON `t_msg` | Protobuf `t_msg` |
| --- | --- | --- | --- |
| Publisher | `python`, PyZMQ/libzmq | `25 + 25 × S_kib` | `15 + 7 × S_kib` |
| Publisher | `cpp`, cppzmq/libzmq | `8 + 12 × S_kib` | `4 + 4 × S_kib` |
| Subscriber | `java`, Spring Boot/JeroMQ | `20 + 18 × S_kib` | `12 + 6 × S_kib` |
| Subscriber | `python`, PyZMQ/libzmq | `30 + 26 × S_kib` | `18 + 8 × S_kib` |
| Subscriber | `cpp`, cppzmq/libzmq | `8 + 11 × S_kib` | `5 + 4 × S_kib` |

JeroMQ is the standalone Java implementation for this profile. Java through JNI/libzmq is outside the model.

## Queue model

```text
Q_window = min(HWM, ceil(f × T_window))
Q_full = HWM
```

Both depths are in messages per connection. `T_window` is the buffer time in seconds. The ceiling includes a whole message for a fractional count. At zero frequency `Q_window = 0`. The full scenario uses HWM at any frequency. These depths represent scenarios for memory estimates. Actual queue depths and memory use can differ. HWM describes a queue limit, and memory use depends on how many messages accumulate. [Queue estimator](src/core/queue.ts).

## RAM model

Use `Q_window` and `Q_full` separately for each role. For each bound `k` (`low` or `high`), use its base RAM in MiB, connection RAM in KiB, and overhead `O` in bytes per message. The base includes the runtime and fixed application structures.

```text
M_process = M_base + M_connections + M_queues
M_pub_k = M_base_pub_k + M_conn_pub_k / 1024 + Q × (S + O_pub_k) / 1048576
M_sub_k = M_base_sub_k + N × M_conn_sub_k / 1024 + N × Q × (S + O_sub_k) / 1048576
M_nominal = (M_low + M_high) / 2
```

The results are in MiB. One publisher has `Q` queued messages. The subscriber has `N × Q` queued messages across its connections. The code uses `M_low + (M_high - M_low) / 2` for the mean. The mean is a model convention. [RAM estimator](src/core/memory.ts).

| Role | Language | Base RAM, MiB low–high | Connection RAM, KiB low–high | Message overhead, B low–high |
| --- | --- | ---: | ---: | ---: |
| Publisher | `python` | 30–100 | 32–160 | 128–512 |
| Publisher | `cpp` | 5–30 | 24–128 | 64–256 |
| Subscriber | `java` | 256–600 | 64–256 | 128–512 |
| Subscriber | `python` | 30–120 | 32–160 | 128–512 |
| Subscriber | `cpp` | 10–60 | 24–128 | 64–256 |

## Overload and warnings

```text
mu = 1000000 / t_sub
Q_growth = max(0, R - mu) × T
```

`mu` estimates the capacity of one sequential subscriber handler in msg/s. `T` is the overload duration in seconds. The implementation uses `T_window`. `Q_growth` estimates unserved messages at the offered rate. It assumes a fixed handler rate and excludes loss. RAM uses the two queue scenarios. A pipeline that overlaps I/O and deserialization can have a different capacity. [Capacity checks](src/core/capacity.ts).

| Warning code | Condition |
| --- | --- |
| `UNVALIDATED_COEFFICIENTS` | Every estimate. |
| `KERNEL_MEMORY_NOT_INCLUDED` | Every estimate. |
| `HWM_NOT_HARD_RSS_LIMIT` | Every estimate. |
| `CPU_SINGLE_THREAD_RISK` | `C_sub_nominal ≥ singleThreadWarningThreshold`. Also sets `cpuSingleThreadRisk`. |
| `CPU_DEMAND_EXCEEDS_ONE_CORE` | `C_sub_nominal ≥ 1`. |
| `CPU_CONSERVATIVE_DEMAND_EXCEEDS_ONE_CORE` | `C_sub_high ≥ 1`. |
| `OFFERED_LOAD_EXCEEDS_CAPACITY` | `R > mu`. At `R = mu`, `Q_growth = 0`. |
| `POTENTIAL_PUBSUB_MESSAGE_LOSS` | `R > mu` or `C_sub_high ≥ 1`. |
| `HIGH_MESSAGE_RATE` | `R ≥ highMessageRateWarningMsgPerSecond`. |
| `LARGE_MESSAGE_SIZE` | `S ≥ largeMessageWarningBytes`. |
| `LARGE_PUBLISHER_COUNT` | `N ≥ largePublisherCountWarning`. |

## Model settings

[`settings.json`](src/profiles/settings.json) holds these values apart from the algorithms. The `0.7` core threshold is a design criterion for the model.

| Setting | Value | Source |
| --- | ---: | --- |
| `hwm` | 1000 messages per connection | Specification |
| `queueWindowSeconds` | 1 s | Specification |
| `cpuOptimisticFactor` | 0.5 | Specification |
| `cpuNominalFactor` | 1.0 | Specification |
| `cpuConservativeFactor` | 3.0 | Specification |
| `singleThreadWarningThreshold` | 0.7 cores | Specification |
| `largeMessageWarningBytes` | 65536 B | Specification |
| `highMessageRateWarningMsgPerSecond` | 100000 msg/s | Implementation |
| `largePublisherCountWarning` | 1000 publishers | Implementation |
| `configVersion` | `1.0.0` | Implementation |

The model version is `1.0`. The version check accepts configuration versions in `1.x.y` with nonnegative integer `x` and `y` and no leading zeros. Change the configuration version when the coefficients or settings change. Keep the reference inputs, versions, results, and tolerances together in regression tests. Equal inputs and the same versioned configuration give equal results. The calculation uses `O(1)` time relative to `N` with a fixed set of scenarios.

Keep coefficients in profiles so they can change independently of the formulas. Treat additional languages, libraries, serialization formats, queue scenarios, and source topologies as changes to the supported model.

## Model limits

- CPU estimates cover work due to the offered message load. Background process load and business logic are outside the calculation. Large messages, complex JSON, high rates, and changes in memory allocation can reduce accuracy.
- RAM estimates target resident process memory. Keep RSS, JVM heap, native memory, kernel buffers, and virtual address space separate. The Java profile estimates the process as a whole. Heap size and `-Xmx` are separate settings. More heap, threads, allocations, or Spring Boot components can increase RAM above the high estimate.
- The RAM model excludes kernel TCP buffers, unbounded application queues, cached telemetry, extra copies, large temporary allocations, business logic, OS services, changes due to GC tuning, and nonresident virtual memory.
- PUB/SUB can lose messages under overload, so the delivered rate can differ from `R`. HWM describes a depth, and the retained messages depend on queue behavior. Delivery guarantees, retention of the last `N` messages, latency percentiles, response time, and hard real-time behavior are outside the model.
- The input describes one class of sources with one frame per message. Production publisher and subscriber processes, arbitrary JSON or Protobuf size estimation, multipart framing, and hardware detection are outside the calculation.

## Reference case and validation

The specification reference uses 300 Python publishers, one Java subscriber, JSON, 1024 B per message, 20 msg/s per publisher, and HWM 1000. The expected results are 6000 msg/s and 6144000 B/s (6.144 MB/s, 49.152 Mbps). `Q_window = 20` and `Q_full = 1000`. CPU time is 50 µs per publisher message and 38 µs per subscriber message. Nominal work is 0.001 and 0.228 cores, respectively.

| Estimate | Low | Nominal | High |
| --- | ---: | ---: | ---: |
| Publisher CPU, % of one core | 0.05 | 0.10 | 0.30 |
| Subscriber CPU, % of one core | 11.4 | 22.8 | 68.4 |
| Subscriber RAM at `Q_window`, MiB | 281.34 | 482.57 | 683.79 |
| Subscriber RAM at `Q_full`, MiB | 604.34 | 859.40 | 1114.45 |

Run `npm run typecheck` and `npm test` with Node.js 24. The test command builds the CLI first. The [integration test](src/tests/integration.test.ts) compares the reference RAM values after rounding to two places with a tolerance of 0.01 MiB. Use explicit, stricter tolerances for unit tests.

- Check all size and rate conversions. For example, 1 KiB gives 1024 B, 1 MiB gives 1048576 B, 60 msg/min gives 1 msg/s, 1 msg/ms gives 1000 msg/s, and 0.5 msg/s gives 0.5 msg/s. Test all 12 publisher, subscriber, and format combinations at 1, 256, 1024, and 65536 B. Check CPU profile selection, time and percentage conversions, scenario factors, and use of unrounded values.
- Check base RAM, per-connection RAM and its linear scaling, per-message RAM, and binary unit conversions. With a 1 s window and HWM 1000, `f = 0`, `0.5`, and `2000` msg/s give `Q_window = 0`, `1`, and `1000`. Check `Q_full = 1000` in all cases.
- With fixed coefficients, more publishers cannot reduce total traffic or subscriber RAM. A higher rate cannot reduce CPU work. A larger message cannot reduce payload traffic or queue RAM. Check `low ≤ nominal ≤ high` for CPU and RAM, `Q_window ≤ HWM`, and zero CPU work at zero rate.
- A publisher language change leaves traffic and subscriber estimates equal. A subscriber language change leaves publisher estimates equal. At the same input size, JSON and Protobuf use the same payload size.
- Check one and many publishers, minimum and maximum byte sizes, zero and fractional rates, and numeric limits. Check structured errors for negatives, `NaN`, infinity, missing fields, unknown choices, and invalid configuration versions. Check the reference case after changes to formulas or coefficients.

The acceptance checks cover all input types, profiles, estimates, queue scenarios, warning codes, and model limitations. They run without a network or special hardware. Field measurements can calibrate the model separately.

## Experimental validation

The specification defines optional measurements on a separate test system.

- Use the supported publisher and subscriber implementations. Generate the specified size and rate. Include a source ID and sequence number in each test message. Select baseline and limit cases from 1, 50, 100, 300, 600, and 1000 sources, sizes of 64 B, 256 B, 1 KiB, 16 KiB, and 64 KiB, and rates of 1, 10, 20, 100, and 1000 msg/s. Use JSON and Protobuf and Java, Python, and C++ subscriber profiles.
- Start the subscriber, warm the Java application and JVM if applicable, and wait for subscriptions. Start the publishers and let the load stabilize. Measure over a fixed interval. Record sent and received rates, CPU time, RSS, loss, latency, and GC pauses. Repeat at least three times and record the median and spread. Record the OS, library versions, CPU model, container limits, and JVM settings.
- Use process CPU time. Calculate `t_measured = (CPU_time_load - CPU_time_idle) / processedMessages` and convert it to µs/message. Count messages that the subscriber processes and record losses separately. Tools include `pidstat`, `perf`, Java Flight Recorder, and JVM process CPU metrics.
- Record RSS, JVM heap used and committed, non-heap and native memory, GC activity, and kernel buffers when available. Measure base RAM after warm-up apart from queue RAM. To estimate connection memory, vary the count of active connections with zero traffic. Tools include `/proc/<pid>/status`, `smaps_rollup`, `pidstat -r`, `jcmd`, Java Flight Recorder, and Native Memory Tracking.
- Slow the subscriber to fill queues. Check RAM growth, HWM behavior, lost messages, delivery delay, and recovery when the overload ends. Use received IDs and sequence numbers to check delivery.
- Fit `t = a + b × S_kib` at multiple message sizes. Fit each language, library, format, platform, and relevant runtime configuration separately. Record ranges where the linear model does not fit. Use a new profile for measured coefficients and record the source, date, configuration, and valid range. A later model can use a piecewise fit for nonlinear ranges.
