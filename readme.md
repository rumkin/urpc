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
import urpc from 'urpc';

async function handler(req, res) {
    if (req.method === 'greet') {
        res.result = `Hello, ${req.params[0]}!`;
    }
    else {
        res.error = urpc.Error.methodNotFound(req.method);
    }
};

// Create listening (server) connection with custom server
wsServer.on('connection', (conn) => {
    const rpc = new urpc.Stream(handler);

    conn.on('message', (message) => {
        rpc.write(JSON.parse(message));
    });

    conn.on('close', () => {
        rpc.close();
    });

    rpc.on('data', (msg) => {
        conn.write(JSON.stringify(msg));
    });

    rpc.on('close', () => {
        conn.close();
    });
});
```
