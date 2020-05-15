# μRPC v5

Transport agnostic bidirectional JsonRPC 1.0 implementation for browser and
node.js.

### Install

Install via npm:

```
npm i urpc
```

Import in browser:

```html
<!-- UMD -->
<script src="https://unpkg.com/@urpc/build/urpc.umd.js"></script>
```

And then use in some script:
```html
<script>
  const rpc = new Urpc.Connection()
</script>
```

Single-file ESM and CommonJS versions are also distributed with a
build.

### Usage

Hello world example. This is a simple endpoint which provide single
method `greet(name)`, which returns a greeting message as a result.

```javascript
import {Connection} from 'urpc';

async function handler({req, res}) {
  if (req.method === 'greet') {
    res.result = `Hello, ${req.params[0]}!`;
  }
};

// Create listening (server) connection with custom server
wsServer.on('connection', (conn) => {
  const rpc = new Connection(handler);

  // Message exchange
  conn.on('message', (message) => {
    rpc.write(message);
  });

  rpc.on('message', (message) => {
    conn.write(message);
  });

  // Connection state syncing
  conn.on('close', () => {
    rpc.close();
  });

  rpc.on('close', () => {
    conn.close();
  });

  // Call remote end with the same handler
  rpc.call('greet', ['World'])
  .then((result) => {
    result; // "Hello, World!"
  });

  // Send notification
  rpc.publish('event', []);
});
```

## Codecs

By default all messages passed in or out of a connection is encoded and decoded
via built-in default codec (which is JSON). But you may use no codec:

```js
import {Connection} from 'urpc';

const rpc = new Connection({
  codec: null, // no codec
});
```

Or define another codec:
```js
import {Connection} from 'urpc';
import CBOR from 'cbor';

const cborCodec = {
  encode(v) {
    return CBOR.encode(v)
  },
  decode(v) {
    return CBOR.decode(v)
  },
};

const rpc = new Connection({
  codec: cborCodec,
});
```


## License

MIT © [Rumkin](https://rumk.in)
