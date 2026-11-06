# ZMQT-Capacity

Estimate CPU load, RAM use, and payload traffic for ZeroMQ PUB/SUB.

## What Is This?

ZMQT-Capacity is a tool for preliminary capacity estimates. It models identical publishers that send single-frame messages over TCP to one subscriber.

## Features

- Calculate the total message rate and payload traffic.
- Estimate low, nominal, and high CPU load and RAM use for one publisher and the subscriber. Estimate RAM for the buffer window and for queues at the high-water mark (HWM).
- Estimate the throughput of one subscriber handler and how many messages go unserved during the buffer window. Report overload and possible message loss.
- Select Python or C++ profiles for publishers and Java, Python, or C++ profiles for the subscriber. Use JSON or Protobuf serialization.

## Who is it for?

For engineers who estimate load and size CPU, RAM, and network resources for ZeroMQ PUB/SUB systems.

## How to install and use

Requires Node.js 24. The tool runs offline after setup.

### CLI

Run these commands in the project folder.

```sh
npm ci
npm run build
npm run cli
```

After you install the built npm package, run `zmqt-capacity`. For help, run `npm run cli -- --help` or `zmqt-capacity --help`.

Enter one value per line. Use a decimal point or comma. Press `Ctrl+C` to cancel.

Example session with part of the report

```text
Publisher count (integer, 1 or more) > 300
Serialized message size (greater than 0) > 1
Size unit (B / KiB / MiB) > KiB
Messages from one publisher per period (0 or more) > 20
Period — minute, second, or millisecond (minute / second / millisecond) > second
Publisher language (python / cpp) > python
Subscriber language (java / python / cpp) > java
Serialization format (json / protobuf) > json

Preliminary ZeroMQ estimate
Model 1.0, profiles 1.0.0
Input — 300 publisher(s), 1 024 B, 20 msg/s per publisher, json
Total message rate — 6 000 msg/s
Payload traffic — 6 144 000 B/s, 6.144 MB/s, 49.152 Mbps
```
