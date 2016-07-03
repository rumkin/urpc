const WS = require('websocket');
const RPC = require('RPC');


const wss = new WS.Server({
    port: port,
});

// Echo server
const server = new RPC.Server({
    onCall(method, args) {
        if (method === 'echo') {
            return args[0];
        } else {
            return null;
        }
    }
});

wss.on('connection', (ws) => {
    const client = server.client(new RPC.Tunnel(channel));

    client.call('echo', 'Hello').than(
        result => console.log(result) // => Hello
    );
});
