import {TypedEmitter} from './typed-emitter.js'
import {
  EInvalidRequest,
  EParseError,
  ETimeout,
  EClosed,
  protocolErrorFrom,
  EMethodNotFound,
  EInternalError,
  EUnkownMessageId,
} from './errors.js'
import {
  isMessage,
  isErrorMessage,
  isRequestMessage,
} from './utils.js'
import {
  formatError,
  formatRequest,
} from './utils.js'
import {UrpcRequest} from './request.js'
import {UrpcResponse} from './response.js'

// Default codec which only passses messages back and forse.
const noCodec = {
  encode: (v) => v,
  decode: (v) => v,
}

const jsonCodec = {
  encode: (v) => JSON.stringify(v),
  decode: (v) => JSON.parse(v),
}

async function asyncNoop() {}

/**
 * @typedef {Object} UrpcCodec
 * @param {Function} encode Encode value and return string or buffer.
 * @param {Function} decode Receive a string or buffer and decode it into a message.
 */

/**
 * @typedef {Function} UrpcHandler
 * @param {Object} context Context value.
 * @param {UrpcConnection} context.stream Current UrpcConnection instance
 * @param {UrpcRequest} context.req UrpcRequest instance
 * @param {UrpcResponse} context.res UrpcResponse instance
 * @returns {Promise<void>} Handler returns nothing, but provides a result by modifying response object.
 */

/**
 * @typedef {Object} UrpcConnectionOptions
 * @param {UrpcHandler} handler Urpc stream handler function
 * @param {string|Null|UrpcCodec} [codec="json"] codec instance or codec id.
 */
export class UrpcConnection extends TypedEmitter {
  /**
   *
   * @param {UrpcHandler} [handler] Handler function
   * @param {UrpcConnectionOptions} options  UrpcConnection options object
   */
  constructor(
    handler, options = {},
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
    this._queue = [];
    this._messageCounter = 0;

    this._isEnding = false;
    this._isEnded = false;

    const {
      handler: handlerFn = asyncNoop,
      codec = 'json',
    } = Object.assign(
      {},
      options,
      typeof handler === 'function'
        ? {handler}
        : handler
    )

    this._handler = handlerFn;
    this._codec = getCodec(codec);
  }

  get isClosed() {
    return this._isEnding || this._isEnded;
  }

  get isEnded() {
    return this._isEnded;
  }

  get isEnding() {
    return this._isEnding;
  }

  _increaseCounter() {
    this._messageCounter += 1;
  }

  _decreaseCounter() {
    this._messageCounter -= 1;
  }

  _push(data) {
    const encoded = this._codec.encode(data);

    // Node.js Stream interface event
    this.emit('data', encoded);
    // Connection interface event
    this.emit('message', encoded);

    if (this._isEnding && this._messageCounter === 0) {
      this.emit('finish');
      this._closeOnDone();
    }
  }

  write(rawMessage) {
    if (rawMessage === null) {
      this.end();
      return;
    }
    else if (this._isEnded) {
      throw new EClosed();
    }

    let message
    try {
      message = this._codec.decode(rawMessage);
    }
    catch (err) {
      this._push(
        formatError(undefined, new EParseError())
      );
      this.end();
      return;
    }

    if (isMessage(message) === false) {
      this._push(
        formatError(undefined, new EInvalidRequest(message))
      );
      this.end();
      return;
    }

    if ('method' in message) {
      this.handleRequest(message);
      return
    }
    else if ('result' in message) {
      this._handleResponse(message);
      return
    }
    else if ('error' in message) {
      this._handleError(message);
      return
    }

    const error = new EInvalidRequest(message);

    this._push(
      formatError(message.id, error)
    );
    this.emit('error', error);
    this.end();
  }

  handleRequest(message) {
    if (isRequestMessage(message) !== true) {
      const error = new EInvalidRequest(message);

      this._push(
        formatError(message.id, error)
      );
      this.emit('error', error);
      this.end();
      return;
    }
    else if (this._isEnding && message.id) {
      this._push(
        formatError(message.id, {
          code: 'urpc/refused',
          message: 'Request refused',
          data: {
            reason: 'closed',
          },
        })
      )
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
        this._push(res.toJSON());
      };
    }

    const onError = (error) => {
      // Handler should not throw errors. It should provide it through response object.
      // If error haas been thrown, then something went wrong.
      if (onResult) {
        this._decreaseCounter();
      }

      this._push(
        formatError(message.id, new EInternalError({}))
      );
      this.emit('error', error);
      this.close();
    };

    this._handler.call(this, {connection: this, req, res})
    .then(onResult, onError)
    .catch(error => {
      this.emit('error', error);
      this.close();
    });

    this.emit('request', req, res);
  }

  _handleResponse(message) {
    if (isErrorMessage(message)) {
      const error = new EInvalidRequest(message);

      this._push(
        formatError(message.id, error)
      );
      this.emit('error', error);
      this.end();

      return;
    }

    const call = spliceBy(this._queue, (item) => (item.id === message.id));

    if (! call) {
      this.emit('error', new EUnkownMessageId({
        id: message.id,
      }));
      this.end();
      return;
    }

    call.resolve(message.result);

    if (this._isEnding) {
      this._closeOnDone();
    }
  }

  _handleError(message) {
    if (! isErrorMessage(message)) {
      this.emit('error', new EInvalidRequest(message));
      this.end();

      return;
    }

    const call = spliceBy(this._queue, (item) => (item.id === message.id));

    if (! call) {
      this.emit('error', new EUnkownMessageId({
        id: message.id,
      }));
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
      return;
    }

    if (this._isEnding) {
      this._closeOnDone();
    }
  }

  end() {
    if (this.isClosed) {
      return;
    }

    if (this._messageCounter > 0 || this._queue.length > 0) {
      this._isEnding = true;
    }
    else {
      this.close()
    }
  }

  close() {
    const closed = new EClosed();

    this._queue.forEach(({reject}) => {
      reject(closed);
    });

    const rejectedCalls = this._queue.length;
    const rejectedRequests = this._messageCounter;

    this._queue.length = 0;
    this._messageCounter = 0;

    this._isEnding = false;
    this._isEnded = true;

    this.emit('close', {
      rejectedCalls,
      rejectedRequests,
    });

    this.removeAllListeners();
  }

  _closeOnDone() {
    if (this._messageCounter > 0 || this._queue.length > 0) {
      return
    }

    this.close();
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

      this._push(
        formatRequest(id, {method, params})
      );
      this._queue.push({
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
    this._push(
      formatRequest(undefined, {method, params})
    );
  }

  setHandler(handler) {
    this._handler = handler;
  }

  setCodec(codec) {
    this._codec = getCodec(codec);
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

function getCodec(codec) {
  switch (codec) {
    case null:
      return noCodec;
    case 'json':
      return jsonCodec;
    default:
      return codec;
  }
}
