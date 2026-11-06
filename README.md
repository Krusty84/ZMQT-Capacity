# ZMQT-Capacity

This module gives preliminary estimates of CPU use, RAM use, and payload traffic for ZeroMQ PUB/SUB. The model describes traffic from identical publishers to one subscriber.

## CLI

Requires Node.js 24. After you install the dependencies, you can build the module and run estimates offline.

```sh
npm ci
npm run build
npm run cli
```

After installing the built npm package, run `zmqt-capacity`. For help, run `zmqt-capacity --help` or `npm run cli -- --help`.

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
Total message rate — 6 000 msg/s
Payload traffic — 6 144 000 B/s, 6.144 MB/s, 49.152 Mbps
```

Enter one value per line. Use a decimal point, as in `0.5`. The CLI also accepts a decimal comma. Press Ctrl+C to cancel the calculation.

## API

```js
import { estimateCapacity } from "zmqt-capacity";

const estimate = estimateCapacity({
  publisherCount: 300,
  messageSize: 1,
  messageSizeUnit: "KiB",
  messageFrequency: 20,
  frequencyUnit: "second",
  publisherLanguage: "python",
  subscriberLanguage: "java",
  serialization: "json",
});

if (estimate.ok) {
  console.log(estimate.result);
} else {
  console.error(estimate.error);
}
```

Set `messageSize` to the serialized message size. Valid size units are `B`, `KiB`, and `MiB`. Set the message rate per `minute`, `second`, or `millisecond`. The publisher count and the size in bytes must be positive safe integers in JavaScript.

`subscriber.estimatedUnservedMessagesInWindow` estimates how many messages go unserved during the buffer window. Use this field to diagnose overload. The warning thresholds are 100 000 msg/s in total for high message rate and 1 000 publishers for large publisher count.

Profiles and settings are in `src/profiles`. If you change coefficients, update `configVersion` in `settings.json`. The result includes the model version, configuration version, assumptions, and warning codes.

## Checks

```sh
npm run typecheck
npm test
```
