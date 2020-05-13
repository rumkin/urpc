# μRPC

Tiny transport agnostic bidirectional JSONRPC implementation for browser and
node.js.

### Install

Install via npm:

```
npm i urpc
```

### Usage

Simple usage example.

```javascript
import {UrpcStream} from 'urpc';

async function handler({req, res}) {
  if (req.method === 'greet') {
    res.result = `Hello, ${req.params[0]}!`;
  }
};

// Create listening (server) connection with custom server
wsServer.on('connection', (conn) => {
  const rpc = new UrpcStream(handler);

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
});
```

## License

MIT © [Rumkin](https://rumk.in)
