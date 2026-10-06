# SDK and host compatibility

SDK 0.1.0 targets bridge V1. Android is the supported host. iOS support is deferred.
The browser runtime is an ES module with no production dependencies or build step.
The development kit and server example are tested using Node 24.x (24.12 or later).

| Capability                                                     | Minimum Android host |
| -------------------------------------------------------------- | -------------------- |
| Basic public identity, records, native chat and payment review | 0.0.16               |
| Verified app sign-in and user-selected files                   | 0.0.51               |
| ATProto PDS blob uploads                                       | 0.0.52               |
| User-clicked external browser links                            | 0.0.53               |
| Native Back consumes mini-app web history                      | 0.0.56               |
| Renewable host leases and payment fulfilment identity          | 0.0.62               |

Set `minimumHostVersion` to the highest version your app's required features need.
SDK version and host version are separate: installing a newer SDK does not add
capabilities to an older host or grant your app permissions.

The preview uses fixtures, not a real account. Verified login, PDS uploads and
funded payments require a configured host and real-device acceptance testing.
The public release packaging and types are checked independently of the private
Tabs application; this is not a claim that every device flow has been retested.
