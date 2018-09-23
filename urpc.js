/* eslint-disable max-statements */
;(function(global) {
    const PARSE_ERROR = -32700;
    const INVALID_REQUEST = -32600;
    const METHOD_NOT_FOUND = -32601;
    const INVALID_PARAMS = -32602;
    const INTERNAL_ERROR = -32603;

    const messages = Object.freeze({
        [PARSE_ERROR]: 'Parse Error',
        [METHOD_NOT_FOUND]: 'Method Not Found',
        [INVALID_REQUEST]: 'Invalid Request',
        [INVALID_PARAMS]: 'Invalid Params',
        [INTERNAL_ERROR]: 'Internal Error',
    });

    class RpcError extends Error {
        constructor({code, message, data = {}} = {}) {
            super();

            if (typeof message === 'undefined') {
                message = messages[code];
            }

            this.code = code;
            this.message = message;
            this.data = data;
        }

        toString() {
            return `[${this.code}] ${this.message}`;
        }

        static methodNotFound(method) {
            const error = new this({
                code: METHOD_NOT_FOUND,
                message: messages[METHOD_NOT_FOUND],
                data: {method},
            });

            Error.captureStackTrace(error, this.methodNotFound);

            return error;
        }

        static invalidParams(params) {
            const error = new this({
                code: INVALID_PARAMS,
                message: messages[INVALID_PARAMS],
                data: {params},
            });

            Error.captureStackTrace(error, this.invalidParams);

            return error;
        }

        static internalError(originError) {
            const error = new this({
                code: INTERNAL_ERROR,
                message: originError.message,
                data: {},
            });

            Error.captureStackTrace(error, this.internalError);

            return error;
        }
    }

    function rpcRequest(id, {method, params = []}) {
        return {
            jsonrpc: '1.0',
            id,
            method,
            params,
        };
    }

    function rpcResponse(id, result = null) {
        return {
            jsonrpc: '1.0',
            id,
            result,
        };
    }

    function rpcError(id, {code, message, data}) {
        return {
            jsonrpc: '1.0',
            id,
            error: {code, message, data},
        };
    }

    class TypedEmitter {
        on(event, listener) {
            if (event in this.listeners === false) {
                throw new Error(`Unknown event ${event}`);
            }
            else if (typeof listener !== 'function') {
                throw new Error('Argument #2 shoul de a function');
            }

            this.listeners[event].push(listener);

            return this;
        }

        removeListener(event, listener) {
            if (event in this.listeners === false) {
                return;
            }
            if (typeof listener === 'undefined') {
                this.listeners[event] = [];
            }
            else {
                this.listeners[event] = this.listeners[event].filter(
                    (item) => (item !== listener)
                );
            }

            return this;
        }

        removeAllListeners() {
            for (const key of Object.getOwnPropertyNames(this.listeners)) {
                this.listeners[key] = [];
            }
        }

        emit(event, ...args) {
            if (event in this.listeners === false) {
                throw new Error(`Unknown event ${event}`);
            }

            this.listeners[event].forEach((listener) => {
                listener.call(this, ...args);
            });

            return this;
        }
    }

    class RpcStream extends TypedEmitter {
        constructor(handler) {
            super();

            this.id = 0;
            this.queue = [];
            this.incomingMessages = 0;

            this.isEnding = false;
            this.isEnded = false;
            this.isClosed = false;

            this.handler = handler;
            this.listeners = {
                data: [],
                end: [],
                error: [],
                finish: [],
            };
        }

        _increaseCounter() {
            this.incomingMessages += 1;
        }

        _decreaseCounter() {
            this.incomingMessages -= 1;
        }

        push(data) {
            this.emit('data', data);

            if (this.isEnding && this.incomingMessages === 0) {
                this.setEnded();
            }
        }

        write(message) {
            if (message === null) {
                this.end();
                return;
            }
            else if (this.isClosed) {
                // ... or throw?
                return;
            }
            else if (typeof message === 'string' || message instanceof Buffer) {
                try {
                    message = JSON.parse(message);
                }
                catch (err) {
                    this.push(rpcError(undefined, {code: PARSE_ERROR, message: 'Not a valid JSON'}));
                    this.end();
                    return;
                }
            }

            if (isMessage(message) === false) {
                this.push(rpcError(undefined, new RpcError({
                    code: INVALID_REQUEST,
                })));
                this.end();
                return;
            }

            if ('method' in message) {
                this.handleRequest(message);
            }
            else if ('result' in message) {
                this.handleResponse(message);
            }
            else if ('error' in message) {
                this.handleError(message);
            }
            else {
                const error = new RpcError({
                    code: INVALID_REQUEST,
                    message: messages[INVALID_REQUEST],
                    data: message,
                });

                this.push(rpcError(message.id, error));
                this.emit('error', error);
                this.end();
            }
        }

        handleRequest(message) {
            if (isRequestMessage(message) !== true) {
                const error = new RpcError({
                    code: INVALID_REQUEST,
                    message: messages[INVALID_REQUEST],
                    data: message,
                });

                this.push(rpcError(message.id, error));
                this.emit('error', error);
                this.end();
                return;
            }

            const req = new Request(message);
            const res = new Response(message);

            let onResult = null;
            if (message.id) {
                this._increaseCounter();
                onResult = () => {
                    this._decreaseCounter();
                    this.push(res.toJSON());
                };
            }

            const onError = (error) => {
                if (onResult) {
                    this._decreaseCounter();
                }

                this.emit('error', error);
                this.end();
            };

            this.handler.call(this, req, res)
            .then(onResult)
            .catch(onError);
        }

        handleResponse(message) {
            if (isErrorMessage(message)) {
                const error = new RpcError({
                    code: INVALID_REQUEST,
                    message: messages[INVALID_REQUEST],
                    data: message,
                });

                this.push(rpcError(message.id, error));
                this.emit('error', error);
                this.end();

                return;
            }

            const call = spliceBy(this.queue, (item) => (item.id === message.id));

            if (! call) {
                // Send error/Ignore ?
                this.end();
                return;
            }

            call.resolve(message.result);
        }

        handleError(message) {
            if (! isErrorMessage(message)) {
                this.emit('error', new RpcError({
                    code: INVALID_REQUEST,
                }));
                this.end();

                return;
            }

            const call = spliceBy(this.queue, (item) => (item.id === message.id));

            if (! call) {
                // TODO Emit error.
                this.end();
                return;
            }

            call.reject(new RpcError(message.error));
        }

        end() {
            if (this.isClosed) {
                return;
            }

            this.isEnding = true;
            this.isClosed = true;

            const closed = new Error('Closed');

            this.queue.forEach(({reject}) => {
                reject(closed);
            });

            if (this.incomingMessages > 0) {
                return;
            }

            this.setEnded();
        }

        call(method, params, {timeout = 0} = {}) {
            return new Promise((resolve, reject) => {
                const id = ++this.id;
                let timer;

                const removeTimer = () => {
                    if (timer) {
                        clearTimeout(timer);
                    }
                };

                this.push(rpcRequest(id, {method, params}));
                this.queue.push({
                    id,
                    resolve: (result) => {
                        removeTimer();
                        resolve(result);
                    },
                    reject: (error) => {
                        removeTimer();
                        reject(error);
                    },
                });

                if (timeout > 0) {
                    timer = setTimeout(() => {
                        removeTimer();
                        reject(new Error3('timeout', {timeout}));
                    }, timeout);
                }
            });
        }

        publish(method, params) {
            this.push(rpcRequest(undefined, {method, params}));
        }

        setEnded() {
            this.isEnding = false;
            this.isEnded = true;

            this.emit('finish');
        }

        setHandler(handle) {
            this.handle = handle;
        }
    }

    class Request {
        constructor({id, method, params = [], jsonrpc}) {
            this.id = id;
            this.method = method;
            this.params = params;
            this.version = jsonrpc;
        }
    }

    class Response {
        constructor({id} = {}) {
            this.id = id;

            this._result = null;
            this._error = null;
        }

        set result(result = null) {
            this._result = result;
            this._error = null;
        }

        get result() {
            return this._result;
        }

        set error(error) {
            this._result = null;
            this._error = error;
        }

        get error() {
            return this._error;
        }

        valueOf() {
            if (this._error !== null) {
                return rpcError(this.id, this._error);
            }
            else {
                return rpcResponse(this.id, this._result);
            }
        }

        toJSON() {
            return this.valueOf();
        }
    }

    function spliceBy(array, fn) {
        const index = array.findIndex(fn);
        if (index < 0) {
            return;
        }

        const value = array[index];
        array.splice(index, 1);
        return value;
    }

    function isMessage(message) {
        if (! isObject(message) || message.constructor !== Object) {
            return false;
        }

        if ('jsonrpc' in message === false) {
            return false;
        }
        else if (! ['1.0', '2.0'].includes(message.jsonrpc)) {
            return false;
        }

        return true;
    }

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function isNumber(value) {
        return typeof value === 'number';
    }

    function isString(value) {
        return typeof value === 'string';
    }

    function isNonEmptyString(value) {
        return value.trim().length > 0;
    }

    function isRealNumber(value) {
        return isFinite(value) && ! isNaN(value);
    }

    function isFinite(value) {
        return value !== Infinity && value !== -Infinity;
    }

    function isId(id) {
        if (isNumber(id)) {
            if (! isRealNumber(id)) {
                return false;
            }
        }
        else if (isString(id)) {
            if (! isNonEmptyString(id)) {
                return false;
            }
        }

        return true;
    }

    function isRequestMessage(message) {
        if ('id' in message) {
            if (! isId(message.id)) {
                return false;
            }
        }

        if (! (isString(message.method) && isNonEmptyString(message.method))) {
            return false;
        }
        else if (! isObject(message.params)) {
            return false;
        }

        return true;
    }

    function isErrorMessage(message) {
        if ('id' in message) {
            if (! isId(message.id)) {
                return false;
            }
        }

        if (! isObject(message.error) || message.error.constructor !== Object) {
            return false;
        }

        const code = message.error.code;

        if (! (isNumber(code) && isRealNumber(code)) && ! (isString(code) && isNonEmptyString(code))) {
            return false;
        }
        else if (! (isString(error.message) && isNonEmptyString(error.message))) {
            return false;
        }
        else if ('data' in error) {
            if (! isObject(error.data) || error.data.constructor !== Object) {
                return false;
            }
        }

        return true;
    }

    const uRpc = {};

    uRpc.Stream = RpcStream;
    uRpc.Request = Request;
    uRpc.Response = Response;
    uRpc.Error = RpcError;

    // Data errors
    uRpc.PARSE_ERROR = PARSE_ERROR;
    uRpc.INVALID_REQUEST = INVALID_REQUEST;
    // Runtime errors
    uRpc.METHOD_NOT_FOUND = METHOD_NOT_FOUND;
    uRpc.INVALID_PARAMS = INVALID_PARAMS;
    uRpc.INTERNAL_ERROR = INTERNAL_ERROR;

    if (typeof module.exports === 'object') {
        module.exports = uRpc;
    }
    else if (typeof define === 'function' && define.amd) {
        define(function() {
            return uRpc;
        });
    }
    else {
        global.uRpc = uRpc;
    }
})(typeof self !== 'undefined' ? self : this);
