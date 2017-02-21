const RPC = require('../');
const WS = require('ws');
const assert = require('assert');
const stream = require('stream');
const cbor = require('cbor-sync');
const fs = require('fs');

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
                },
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
                }, (error) => {
                    assert.equal(error.code, 'connection_closed', 'Connection closed error');
                    resolve();
                });

                rpc.on('error', reject);

                rpc.close();
            });

            ws.on('error', reject);
        });
    });

    describe('Streams', ()=> {
        class WebSocketRPC extends RPC.Server {
            constructor(options) {
                options.connectEvent = 'connection';
                super(options);
            }

            onConnect(socket) {
                var client = this.client(new RPC.Tunnel({
                    channel: socket,
                    onMessage: (data) => {
                        var result = cbor.decode(data);
                        return result;
                    },
                    onSend: cbor.encode,
                    send(data) {
                        this.channel.send(
                            this.onSend(data), {binary: true}
                        );
                    },
                }));

                this.emit('client', client);
            }
        }

        it('Should send stream in response', () => {
            port++;
            return new Promise((resolve, reject) => {
                const wss = new WS.Server({
                    port: port,
                });

                wss.on('error', reject);

                const rpc = new WebSocketRPC({
                    connection: wss,

                    onCall() {
                        var result = new stream.PassThrough();

                        setImmediate(() => {
                            result.write('stream');
                            result.end();
                        });

                        return result;
                    }
                });

                const ws = new WS('ws://0.0.0.0:' + port);

                ws.on('open', () => {
                    var client = new RPC.Connection(new RPC.Tunnel({
                        channel: ws,
                        onMessage: cbor.decode,
                        onSend: cbor.encode,
                        send(data) {
                            this.channel.send(
                                this.onSend(data), {binary: true}
                            );
                        },
                    }));

                    client.call('method')
                    .then((result) => {
                        assert.ok(result instanceof stream, 'Result is a stream');

                        var data = '';

                        result.on('data', (chunk) => {
                            data += chunk.toString();
                        });

                        result.on('end', () => {
                            assert.ok(data, 'stream', 'Return stream');
                            resolve();
                        });

                        result.on('error', reject);
                    })
                    .catch((error) => {
                        reject(error);
                    });
                });

                ws.on('error', reject);
            });
        });

        it('Should send stream as arguments', () => {
            port++;
            return new Promise((resolve, reject) => {
                const wss = new WS.Server({
                    port: port,
                });

                wss.on('error', reject);

                const rpc = new WebSocketRPC({
                    connection: wss,

                    debug: true,

                    onCall(method, args) {
                        return new Promise((resolve, reject) => {
                            var stream = args[0];

                            var data = '';
                            stream.on('data', chunk => {
                                data += chunk;
                            });

                            stream.on('end', () => resolve(data));

                            stream.on('error', reject);
                        });
                    }
                });

                const ws = new WS('ws://0.0.0.0:' + port);

                ws.on('open', () => {
                    var client = new RPC.Connection(new RPC.Tunnel({
                        channel: ws,
                        onMessage: cbor.decode,
                        onSend: cbor.encode,
                        send(data) {
                            this.channel.send(
                                this.onSend(data), {binary: true}
                            );
                        },
                    }));

                    var output = new stream.PassThrough();

                    client.call('method', output)
                    .then((result) => {
                        assert.equal(result, 'Hello Stream', 'Result is a "stream"');
                        resolve();
                    })
                    .catch((error) => {
                        reject(error);
                    });

                    output.write('Hello');
                    output.write(' Stream');
                    output.end();
                });

                ws.on('error', reject);
            });
        });

        it('Should send file read stream as arguments', () => {
            port++;
            return new Promise((resolve, reject) => {
                const wss = new WS.Server({
                    port: port,
                });

                wss.on('error', reject);

                const rpc = new WebSocketRPC({
                    connection: wss,

                    debug: true,

                    onCall(method, args) {
                        return new Promise((resolve, reject) => {
                            var stream = args[0];

                            var data = '';
                            stream.on('data', chunk => {
                                data += chunk;
                            });

                            stream.on('end', () => resolve(data));

                            stream.on('error', reject);
                        });
                    }
                });

                const ws = new WS('ws://0.0.0.0:' + port);

                ws.on('open', () => {
                    var client = new RPC.Connection(new RPC.Tunnel({
                        channel: ws,
                        onMessage: cbor.decode,
                        onSend: cbor.encode,
                        send(data) {
                            this.channel.send(
                                this.onSend(data), {binary: true}
                            );
                        },
                    }));

                    var output = new fs.createReadStream(__dirname + '/test-file');

                    client.call('method', output)
                    .then((result) => {
                        assert.equal(result, 'Hello Stream\n', 'Result is a "stream"');
                        resolve();
                    })
                    .catch((error) => {
                        reject(error);
                    });
                });

                ws.on('error', reject);
            });
        });
    });
});
