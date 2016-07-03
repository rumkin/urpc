const RPC = require('../');
const WS = require('ws');
const assert = require('assert');

class WebSocketRPC extends RPC.Server {
    constructor(options) {
        options.connectEvent = 'connection';
        super(options);
    }

    onConnect(socket) {
        var client = this.client(new RPC.Tunnel({
            channel: socket,
            onMessage: JSON.parse,
            onSend: JSON.stringify,
        }));

        this.emit('client', client);
    }
}

describe('RPC', () => {
    var port = 32320;

    it('Should call rpc method', function(){
        port++;
        return new Promise((resolve, reject) => {
            const wss = new WS.Server({
                port: port,
            });

            wss.on('error', reject);

            const rpc = new WebSocketRPC({
                connection: wss,
                onCall(method, args) {
                    assert.equal(method, 'greeting.get', 'Method is "greeting.get"');
                    assert.deepEqual(args, ['rpc'], 'Arguments is ["rpc"]');

                    setImmediate(() => this.close());
                    return `Hello ${args[0]}`;
                }
            });

            const ws = new WS('ws://0.0.0.0:' + port);

            ws.on('open', () => {
                var api = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                api.call('greeting.get', 'rpc')
                .then((result) => {
                    assert.equal(result, 'Hello rpc', 'RPC result matches');
                    resolve();
                })
                .catch(reject);
            });

            ws.on('error', reject);
        });
    });

    it('Should work in both directions', () => {
        port++;

        return new Promise((resolve, reject) => {
            const wss = new WS.Server({
                port: port,
            });

            wss.on('connection', (ws) => {
                var client = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                client.onCall((method, args) => {
                    return client.call('get')
                    .then(result => {

                        return result + args[0];
                    });
                });
            });

            wss.on('error', reject);

            const ws = new WS('ws://0.0.0.0:' + port);

            ws.on('open', () => {
                var client = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                client.onCall(() => {
                    return 1;
                });

                client.call('add', 1)
                .then((result) => {
                    assert.equal(result, 2, 'RPC result is 2');
                    resolve();
                })
                .catch(reject);
            });

            ws.on('error', reject);
        });
    });

    it('Should not work when onCall not implemented', () => {
        port++;

        return new Promise((resolve, reject) => {
            const wss = new WS.Server({
                port: port,
            });

            wss.on('error', reject);

            const rpc = new WebSocketRPC({
                connection: wss,
                onCall(method, args) {
                    return this.call('get')
                    .then(result => {
                        return result + args[0];
                    });
                },
            });


            const ws = new WS('ws://0.0.0.0:' + port);

            ws.on('open', () => {
                var client = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                client.call('add', 1)
                .then(() => {
                    reject(new Error('Result is returned'));
                })
                .catch((error) => {
                    resolve();
                });
            });

            ws.on('error', reject);
        });
    });

    it('Should use handshaking', () => {
        port++;
        return new Promise((resolve, reject) => {
            const wss = new WS.Server({
                port: port,
            });

            wss.on('error', reject);

            const rpc = new WebSocketRPC({
                connection: wss,

                onHandshake(params) {
                    return params.login === 'user' && params.password === 'password';
                },

                onCall(method, args) {
                    assert.equal(method, 'greeting.get', 'Method is "greeting.get"');
                    assert.deepEqual(args, ['rpc'], 'Arguments is ["rpc"]');

                    setImmediate(() => this.close());
                    return `Hello ${args[0]}`;
                }
            });

            const ws = new WS('ws://0.0.0.0:' + port);

            ws.on('open', () => {
                var client = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                client.connect({
                    login: 'user',
                    password: 'password'
                })
                .then((result) => {
                    assert.ok(result, 'Result is true');
                    resolve();
                })
                .catch(reject);
            });

            ws.on('error', reject);
        });
    });

    it('Should emit connection_closed error', () => {
        port++;
        return new Promise((resolve, reject) => {
            const wss = new WS.Server({
                port: port,
            });

            wss.on('error', reject);

            const rpc = new WebSocketRPC({
                connection: wss,

                onCall() {
                    return true;
                }
            });

            const ws = new WS('ws://0.0.0.0:' + port);

            ws.on('open', () => {
                var client = new RPC.Connection(new RPC.Tunnel({
                    channel: ws,
                    onMessage: JSON.parse,
                    onSend: JSON.stringify,
                }));

                client.call('method')
                .then(() => {
                    reject(new Error('result returned'));
                })
                .catch((error) => {
                    assert.equal(error.code, 'connection_closed', 'Connection closed error');
                    resolve();
                });

                rpc.close();
            });

            ws.on('error', reject);
        });
    });
});
