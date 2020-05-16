# CHANGELOG

## v5.3.0

### Changes

* Make `params` arguments optional for `Connection#call()` and `Connection#publish()`.
* Reworked internal structure to emit errors and handle message in more precise
  and predictable way.
* Rename connection private property `id` with an underline.

### Fixes

* Fix `finish` event invocation to be triggered once.
* Fix incoming notifications handling in ending state.

## v5.2.0

### Changes

* Make `params` param optional for `Connection#call()` and  `Connection#publish()`.
* Add `Client` and `Server` classes as connection which represents particular type
  of connection peer.

### Fixes

* Fix `EInvalidRequests` error code.

## v5.1.0

### Changes

* Added missing `Connection#close()` method.
* Added `EUnknownMessageId` error.
* Implement smooth closing.

## v5.0.0

### Breaking changes

* Migrated to ES modules.
* Rename Stream into Connection.
* Modify Connection constructor params.
* Request handler interface is modified.
  was:
  ```js
  async function (req, res) {}
  ```
  become:
  ```js
  async function ({req, res, connection}) {}
  ```
* Hide `Connection` private methods and properties with underscore.
* Error system has been reworked:
  * Added `UrpcError` and `UrpcProtocolError`.
  * Implement protocol dependent errors as classes (instead of functions).
    Each error is ancestor of `UrpcProtocolError`.
  * Add lifetime errors like `EClosed` or `ETimeout` to notify about
    errors not described by the standard.

### Fixes

* Fix `Connection#setHandler()`.
* Fix `TypedEventEmitter` constructor.

## v4.1.0

* Add `request` event.
* Fix minified version.

## v4.0

* Update closing state handling with sending Refused error in response to new
  messages.
  * Add `options` argument to constructor. It has options:
  - `hasToParse` function which determine wether message is parseable.
  - `parseMessage` function to parse message if it's parseable.

## v3.0

* Rename exported names `RpcStream` to `Stream` and `RpcError` to `Error`.
* Update handler interface and make it's behavior closer to regular event
  listeners.
* Fix error response handling.
* Fix error message format checker.
