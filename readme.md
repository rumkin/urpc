# URPC

Universal RPC for node.js with streams support. It allow to send and receive
streams.

## Installation

Install via npm:
```
npm i urpc
```

## API

### Connection

Connection is the transport for connections. It requires message transport like
WebSocket or process. Connection listens `message` event and reply with
`send()` method.

```javascript
// Create listening (server) connection with custom server
server.on('connection', (conn) => {
    var urpc = new URPC.Connection({
        channel: conn,
        onCall(method, args) {
            // ... realize api call mechanism on your own...
            switch (method) {
                //  Echo method
                case 'echo':
                    return args[0];
                break;
                default:
                    return null;
            }
        }
    });
});

// Create client
conn.on('connect', () => {
    var urpc = new URPC.Connection({
        channel: conn,
    });

    urpc.call('echo', 'hello')
    .then(result => assert.equal(result, 'hello', 'Result is "hello"'));
});
```

#### Streaming example

URPC supports passing a streams as arguments or response. Example of file transfer:

```javascript
// Create listening (server) connection with custom server
server.on('connection', (conn) => {
    var urpc = new URPC.Connection({
        channel: conn,
        onCall(method, args) {
            return new Promise((resolve, reject) => {
                var stream = fs.createWriteStream('streamed.js');
                stream.on('error', reject);
                stream.on('end', resolve);

                args[0].pipe(stream);
            });
        }
    });
});

// Create client
conn.on('connect', () => {
    var urpc = new URPC.Connection({
        channel: conn,
    });

    urpc.call('write_file', fs.createReadStream(__filename))
    .then(result => {
        console.log('File is written');
    });
});
```

## License

Licensed under MIT.
