# ZMQT-Capacity

Estimate CPU load, RAM use, and payload traffic for ZeroMQ PUB/SUB.

## What Is This?

ZMQT-Capacity is a tool for preliminary capacity estimates. It models identical publishers that send single-frame messages over TCP to one subscriber.

## Features

- Calculate the total message rate and payload traffic.
- Estimate low, nominal, and high CPU load and RAM use for one publisher and the subscriber. Estimate RAM for the buffer window and for queues at the high-water mark (HWM).
- Estimate the throughput of one subscriber handler and how many messages go unserved during the buffer window. Report overload and possible message loss.
- Select Python or C++ profiles for publishers and Java, Python, or C++ profiles for the subscriber. Use JSON or Protobuf serialization.
- Use **Load payload** to set **Message size** from a JSON or binary Protobuf sample. The tool compacts JSON before it counts UTF-8 bytes.
- Export estimated results to a text file.

## Who is it for?

For engineers who estimate load and size CPU, RAM, and network resources for ZeroMQ PUB/SUB systems.

## How to install and use

Requires Node.js 24. The tool runs offline after setup.

Run these commands in the project folder.

```sh
npm ci
npm run build
npm start
```

After you install the built npm package, run `zmqt-capacity`. Use an interactive terminal with at least 80 columns and 24 rows. For help, run `zmqt-capacity --help`.
