# CHANGELOG

### v4.1.0

* Add `request` event.
* Fix minified version.

### v4.0

* Update closing state handling with sending Refused error in response to new
  messages.
  * Add `options` argument to constructor. It has options:
  - `hasToParse` function which determine wether message is parseable.
  - `parseMessage` function to parse message if it's parseable.

### v3.0

* Rename exported names `RpcStream` to `Stream` and `RpcError` to `Error`.
* Update handler interface and make it's behavior closer to regular event
  listeners.
* Fix error response handling.
* Fix error message format checker.
