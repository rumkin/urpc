import {TypedEmitter} from './typed-emitter.js'
import {
  EInvalidRequest,
  EParseError,
  ETimeout,
  EClosed,
  protocolErrorFrom,
  EMethodNotFound,
} from './errors.js'
import {
  isMessage,
  isErrorMessage,
  isRequestMessage,
} from './utils.js'

function formatRequest(id, {method, params = []}) {
  return {
    jsonrpc: '1.0',
    id,
    method,
    params,
  };
}

function formatResponse(id, result = null) {
  return {
    jsonrpc: '1.0',
    id,
    result,
  };
}

function formatError(id, {code, message, data}) {
  return {
    jsonrpc: '1.0',
    id,
    error: {code, message, data},
  };
}

function hasToParse(msg) {
  return typeof msg === 'string' || msg instanceof Uint8Array;
}

function arrayToString(msg) {
  const array = [];
  for (let i = 0; i < msg.length; i++) {
    array[i] = msg[i];
  }
  return array.join('');
}

function parseMessage(msg) {
  if (msg instanceof Uint8Array) {
    if (typeof Buffer === 'function') {
      return JSON.parse(msg);
    }
    else {
      return JSON.parse(arrayToString(msg));
    }
  }

  return JSON.parse(msg);
}

export class UrpcStream extends TypedEmitter {
  constructor(
    handler = async () => {},
    options = {},
  ) {
    super([
      'data',
      'message',
      'end',
      'error',
      'finish',
      'close',
      'request',
    ]);

    this.id = 0;
    this.queue = [];
    this.incomingMessages = 0;

    this.isEnding = false;
    this.isEnded = false;

    this.handler = handler;
    options = options;
    this.hasToParse = options.hasToParse || hasToParse;
    this.parseMessage = options.parseMessage || parseMessage;
  }

  get isClosed() {
    return this.isEnding || this.isEnded;
  }

  _increaseCounter() {
    this.incomingMessages += 1;
  }

  _decreaseCounter() {
    this.incomingMessages -= 1;
  }

  push(data) {
    // Node.js Stream interface event
    this.emit('data', data);
    // Connection interface event
    this.emit('message', data);

    if (this.isEnding && this.incomingMessages === 0) {
      this.emit('finish');
      this.setEnded();
    }
  }

  write(message) {
    if (message === null) {
      this.end();
      return;
    }
    else if (this.hasToParse(message)) {
      try {
        message = this.parseMessage(message);
      }
      catch (err) {
        this.push(formatError(undefined, new EParseError()));
        this.end();
        return;
      }
    }

    if (isMessage(message) === false) {
      this.push(
        formatError(undefined, new EInvalidRequest(message))
      );
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
      const error = new EInvalidRequest(message);

      this.push(formatError(message.id, error));
      this.emit('error', error);
      this.end();
    }
  }

  handleRequest(message) {
    if (isRequestMessage(message) !== true) {
      const error = new EInvalidRequest(message);

      this.push(formatError(message.id, error));
      this.emit('error', error);
      this.end();
      return;
    }

    const req = new UrpcRequest(message);
    const res = new UrpcResponse(message);

    // Default state is method not found
    res.error = new EMethodNotFound({
      method: req.method,
    })

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
    this.handler.call(this, {rpc: this, req, res})
    .then(onResult)
    .catch(onError);
    this.emit('request', req, res);
  }

  handleResponse(message) {
    if (isErrorMessage(message)) {
      const error = new EInvalidRequest(message);

      this.push(formatError(message.id, error));
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
      this.emit('error', new EInvalidRequest(message));
      this.end();

      return;
    }

    const call = spliceBy(this.queue, (item) => (item.id === message.id));

    if (! call) {
      // TODO Why to close without a error?
      this.end();
      return;
    }

    try {
      const error = protocolErrorFrom(message.error)
      call.reject(error)
    }
    catch (err) {
      call.reject(err)
      this.emit('error', err)
      this.end();
    }
  }

  end() {
    if (this.isClosed) {
      return;
    }

    this.isEnding = true;

    const closed = new EClosed();

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

      this.push(formatRequest(id, {method, params}));
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
          reject(new ETimeout());
        }, timeout);
      }
    });
  }

  publish(method, params) {
    this.push(formatRequest(undefined, {method, params}));
  }

  setEnded() {
    this.isEnding = false;
    this.isEnded = true;

    this.emit('close');
  }

  setHandler(handler) {
    this.handler = handler;
  }
}

export class UrpcRequest {
  constructor({id, method, params = [], jsonrpc}) {
    this.id = id;
    this.method = method;
    this.params = params;
    this.version = jsonrpc;
  }
}

export class UrpcResponse {
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
      return formatError(this.id, this._error);
    }
    else {
      return formatResponse(this.id, this._result);
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

