# ZMQT-Capacity

Estimate CPU load, RAM use, and payload traffic for ZeroMQ PUB/SUB.

## What Is This?

ZMQT-Capacity is a tool for preliminary capacity estimates. It models identical publishers that send single-frame messages over TCP to one subscriber.

<img width="1432" height="516" alt="image" src="https://github.com/user-attachments/assets/0663267f-13ab-43f0-8639-fb6923ac1e69" />

## Features

- Calculate the total message rate and payload traffic.
- Estimate low, nominal, and high CPU load and RAM use for one publisher and the subscriber. Estimate RAM for the buffer window and for queues at the High-Water Mark (HWM).
- Estimate the throughput of one subscriber handler and how many messages go unserved during the buffer window. Report overload and possible message loss.
- Select Python or C++ profiles for publishers and Java, Python, or C++ profiles for the subscriber. Use JSON or Protobuf serialization.
- Load payload to set Message size from a JSON (JSON compacted before it counts UTF-8 bytes) or binary Protobuf sample.
- Export estimated results to a text file.

## Who is it for?

For engineers who estimate load and size CPU, RAM, and network resources for ZeroMQ PUB/SUB systems.

## How to install and use

Requires Node.js 24. The tool runs offline after setup.

Run these commands in the project folder.

```sh
curl -o- https://githubusercontent.com | bash (or, for windows: nvm-setup.exe , https://github.com/nvm-windows/nvm/releases/tag/v2.0.0)
nvm install 24
nvm use 24
npm run build
npm run start
```
