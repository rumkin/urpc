'use strict';

const stream = require('stream');
const EventEmitter = require('events').EventEmitter;

class RpcError extends Error {
    constructor(code, message) {
        super(message);

        this.name = 'RpcError';
        this.code = code;

        Error.captureStackTrace(this, this.constructor);
    }
}

class Connection extends EventEmitter{
    constructor(channel) {
        super();

        this._channel = channel;
        this._id = 0;
        this._handshake = false;
        this.data = new Map();
        this._queue = new Map();
        this.debug = false;

        this.onMessage = this.onMessage.bind(this);
        this.unbind = this.unbind.bind(this);
        this.bind();
    }

    onHandshake(fn) {
        if (typeof fn !== 'function') {
            throw new Error('Argument #1 should be a function');
        }

        this._onHandshake = fn;
    }

    onCall(fn) {
        if (typeof fn !== 'function') {
            throw new Error('Argument #1 should be a function');
        }

        this._onCall = fn;
    }

    setDebug(status = true) {
        this.debug = !! status;
    }

    _onCall() {
        throw new Error('Not implemented');
    }

    bind() {
        this._channel.on('message', this.onMessage);
        this._channel.on('error', this.unbind);
        this._channel.on('close', this.unbind);
    }

    unbind() {
        this._channel.removeListener('message', this.onMessage);
        this._channel.removeListener('close', this.bind);

        Array.from(this._queue.values()).forEach(callback => callback.reject(
            new RpcError('connection_closed', 'Connection closed')
        ));
    }

    onMessage(message) {
        if (! this._handshake && this._onHandshake) {
            this.processHandshakeMessage(message);
        } else if ('method' in message) {
            this.processMethodMessage(message);
        } else if ('result' in message) {
            this.processResultMessage(message);
        } else {
            this.processUnknownMessage(message);
        }
    }

    processHandshakeMessage(message) {
        var id = message.id;
        var result;
        try {
            result = this._onHandshake(message.args[0]);
            if (result instanceof Promise === false) {
                result = Promise.resolve(result);
            }
        } catch (err) {
            result = Promise.reject(err);
        }

        result.then((result) => {
            this._channel.send({
                id,
                result,
                error: null,
            });

            if (result) {
                this._handshake = true;
            } else {
                this.close();
            }

        }, (error) => {
            var message;
            if (this.debug) {
                message = error.message;
            } else {
                message = 'Internal error';
            }

            this._channel.send({
                id,
                result: null,
                error: {
                    code: error.code || 'E_UNKNOWN',
                    message,
                },
            });

            this.emit('error', error);
            this.close();
        });
    }

    processMethodMessage(msg) {
        var result;
        var method = msg.method;
        var channel = this._channel;

        try {
            result = this._onCall(method, msg.args);

            if (result instanceof Promise === false) {
                result = Promise.resolve(result);
            }
        } catch (error) {
            if (error instanceof RpcError) {
                channel.send({
                    id: msg.id,
                    result: null,
                    error: {
                        code: error.code,
                        message: error.message,
                    }
                });
            } else {
                channel.send({
                    id: msg.id,
                    result: null,
                    error: {
                        code: error.code || 'E_UNKNOWN',
                        message: error.message,
                    }
                });
            }
            return;
        }

        result.then((callResult) => {
            if (isReadableStream(callResult)) {
                function onData(chunk) {
                    channel.send({
                        id: msg.id,
                        result: chunk,
                        ended: false,
                        error: null,
                    });
                }

                function onEnd() {
                    channel.send({
                        id: msg.id,
                        ended: true,
                        result: null,
                        error: null,
                    });
                }

                callResult.on('data', onData);
                callResult.on('end', onEnd);

                callResult.once('error', (error) => {
                    channel.send({
                        id: msg.id,
                        ednded: true,
                        error,
                    });

                    callResult.removeListeners('data', onData);
                    callResult.removeListeners('end', onEnd);
                });
            } else {
                channel.send({
                    id: msg.id,
                    result: callResult,
                    error: null,
                });
            }
        }, (error) => {
            var message;
            if (this.debug) {
                message = error.message;
            } else {
                message = 'Internal error';
            }

            channel.send({
                id: msg.id,
                result: null,
                error: {
                    code: error.code || 'E_UNKNOWN',
                    message,
                },
            });
        });
    }

    processResultMessage(msg) {
        var queue = this._queue;

        if (! queue.has(msg.id)) {
            return;
        }

        var id = msg.id;
        var callback = queue.get(id);

        if ('ended' in msg) {
            if (! callback.stream) {
                callback.stream = new stream.PassThrough();
                callback.resolve(callback.stream);
            }

            if (msg.ended) {
                callback.stream.end();
                queue.delete(id);
            } else {
                callback.stream.write(msg.result);
            }
        } else {
            queue.delete(id);

            if (msg.error) {
                let error = new RpcError(msg.error.code, msg.error.message);
                callback.reject(error);
            } else {
                callback.resolve(msg.result);
            }
        }
    }

    processUnknownMessage(message) {
        // TODO Process message...
    }

    connect(credentials) {
        return this.call(null, credentials).then((result) => {
            this._handshake = result;
            return result;
        });
    }

    call(method, ...args) {
        const id = ++this._id;

        this._channel.send({
            id,
            method,
            args,
        });

        return new Promise((resolve, reject) => {
            this._queue.set(id, {
                resolve,
                reject,
            });
        });
    }

    close() {
        this._channel.close();
    }
}

class Server extends EventEmitter{
    constructor({onCall, onHandshake, connection, connectEvent} = {}) {
        super();

        if (onCall) {
            this.onCall(onCall);
        }

        if (onHandshake) {
            this.onHandshake(onHandshake);
        }

        this.onConnect = this.onConnect.bind(this);
        this.unbind = this.unbind.bind(this);

        this.connectEvent = connectEvent || 'connect';

        if (connection) {
            this._connection = connection;
            this.bind();
        }

        this._clients = [];
    }

    onConnect(conn) {
        this.emit('client', this.client(conn));
    }

    onCall(fn) {
        if (typeof fn !== 'function') {
            throw new Error('Argument #1 should be a function');
        }

        this._onCall = fn;
    }

    onHandshake(fn) {
        if (typeof fn !== 'function') {
            throw new Error('Argument #1 should be a function');
        }

        this._onHandshake = fn;
    }

    client(channel) {
        var connection = new Connection(channel);
        connection.onCall(this._onCall);

        if (this._onHandshake) {
            connection.onHandshake(this._onHandshake);
        }

        this._clients.push(connection);
        connection.on('close', () => {
            var i = this._clients.indexOf(connection);
            if (i > -1) {
                this._clients.splice(i, 1);
            }
        });

        return connection;
    }

    bind() {
        this._connection.on(this.connectEvent, this.onConnect);
        this._connection.on('close', this.unbind);
    }

    unbind() {
        this._connection.removeListener(this.connectEvent, this.onConnect);
        this._connection.removeListener('close', this.unbind);
    }

    close() {
        this._clients.forEach(client => client.close());
        return;
    }
}

/**
 * RPC Tunnel is a message channel tunnel for transformation messages. It's
 * like transform stream but for message channels.
 */
class Tunnel extends EventEmitter {
    constructor({channel, onMessage, onSend} = {}) {
        super();

        this.channel = channel;
        this.onMessage = onMessage || this.onMessage;
        this.onSend = onSend || this.onSend;

        channel.on('message', (message) => {
            this.emit('message', this.onMessage(message));
        });

        channel.on('close', this.emit.bind(this, 'close'));
        channel.on('error', this.emit.bind(this, 'error'));
    }

    send(message) {
        this.channel.send(this.onSend(message));
    }

    onMessage(message) {
        return message;
    }

    onSend(message) {
        return message;
    }

    close() {
        this.channel.close();
    }
}

exports.Server = Server;
exports.Connection = Connection;
exports.Error = RpcError;
exports.Tunnel = Tunnel;

/**
 * Check whether passed object is a readable stream.
 *
 * @param  {*}  value Any type of values are acceptable.
 * @return {Boolean}       Return true if object has `on` and `read` methods.
 */
function isReadableStream(value) {
    // Not null object
    if (! value || typeof value !== 'object') {
        return false;
    }

    // Has event support
    if (typeof value.on !== 'function') {
        return false;
    }

    // Has read stream method
    if (typeof value.read !== 'function') {
        return false;
    }

    return true;
}
