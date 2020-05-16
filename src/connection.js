import {StrictEmitter} from './strict-emitter.js'
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

function noop() {}

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
export class UrpcConnection extends StrictEmitter {
  /**
   *
   * @param {UrpcHandler} [handler] Handler function
   * @param {UrpcConnectionOptions} options  UrpcConnection options object
   */
  constructor(
    handler,
    options = {},
  ) {
    super();

    this.registerEvents([
      'close',
      'data',
      'end',
      'error',
      'finish',
      'message',
      'request',
    ]);

    this._id = 0;
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

    if (this._isEnding) {
      this._closeOnDone();
    }
  }

  write(rawMessage) {
    // TODO Remove this. Use end() instead.
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
      this._onParseError(rawMessage);
      return;
    }

    this._onMessage(message);
  }

  _onMessage(message) {
    if (isMessage(message)) {
      if ('method' in message) {
        this._onRequestMessage(message);
        return;
      }
      else if ('result' in message) {
        this._onResponseMessage(message);
        return;
      }
      else if ('error' in message) {
        this._onErrorMessage(message);
        return;
      }
    }

    this._onInvalidRequest(message);
  }

  _onInvalidRequest(message) {
    this._push(
      formatError(message.id, new EInvalidRequest({message}))
    );
    this.end();
  }

  _onParseError(_) {
    this._push(
      formatError(undefined, new EParseError())
    );
    this.end();
  }

  _onRequestMessage(message) {
    if (isRequestMessage(message) !== true) {
      this._onInvalidRequest(message);
      return;
    }
    else if (this._isEnding) {
      if (message.id) {
        this._push(
          formatError(message.id, {
            code: 'urpc/refused',
            message: 'Request refused',
            data: {
              reason: 'closed',
            },
          })
        );
      }
      return;
    }

    this._handleRequest(message);
  }

  _handleRequest(message) {
    const req = new UrpcRequest(message);
    const res = new UrpcResponse(message);

    // Default state is method not found
    res.error = new EMethodNotFound({
      method: req.method,
    })

    let onResult = noop;
    if (message.id) {
      this._increaseCounter();
      onResult = () => {
        this._decreaseCounter();
        this._push(res.toJSON());
      };
    }

    this._handler.call(this, {connection: this, req, res})
    .then(onResult)
    .catch(error => {
      this._onRequestError(message, error)
    });

    this.emit('request', req, res);
  }

  _onRequestError(message, error) {
    this._push(
      formatError(message.id, new EInternalError({}))
    );
    this.emit('error', error);
    this.close();
  }

  _onResponseMessage(message) {
    if (isErrorMessage(message)) {
      this._onInvalidRequest(message);
      return;
    }

    const call = this._popCall(message.id);

    if (! call) {
      this._onMissedId(message.id);
      return;
    }

    this._handleResponse(message, call);
  }

  _handleResponse(message, call) {
    call.resolve(message.result);

    if (this._isEnding) {
      this._closeOnDone();
    }
  }

  _onErrorMessage(message) {
    if (! isErrorMessage(message)) {
      this._onInvalidRequest(message);
      return;
    }

    const call = this._popCall(message.id);

    if (! call) {
      this._onMissedId(message.id);
      return;
    }

    this._handleError(message, call);
  }

  _handleError(message, call) {
    try {
      const error = protocolErrorFrom(message.error);
      call.reject(error);
    }
    catch (err) {
      call.reject(err);
      this.emit('error', err);
      this.end();
      return;
    }

    if (this._isEnding) {
      this._closeOnDone();
    }
  }

  _onMissedId(id) {
    this.emit('error', new EUnkownMessageId({
      id,
    }));
    this.end();
  }

  _popCall(id) {
    return spliceBy(this._queue, (item) => (item.id === id));
  }

  end() {
    if (this.isClosed) {
      return;
    }

    this._isEnding = true;
    this.emit('end');
    this._closeOnDone();
  }

  close() {
    const stat = this._onClose();

    this._isEnding = false;
    this._isEnded = true;

    // TODO Check if this event is needed.
    // Emit only when all incoming job has been done.
    this.emit('finish');
    this.emit('close', stat);

    this.removeAllListeners();
  }

  _onClose() {
    const closed = new EClosed();

    this._queue.forEach(({reject}) => {
      reject(closed);
    });

    const rejectedCalls = this._queue.length;
    const rejectedRequests = this._messageCounter;

    this._queue.length = 0;
    this._messageCounter = 0;

    return {
      rejectedCalls,
      rejectedRequests,
    };
  }

  get _canClose() {
    return this._messageCounter === 0 && this._queue.length === 0;
  }

  _closeOnDone() {
    if (this._canClose) {
      this.close();
    }
  }

  call(method, params = [], {timeout = 0} = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._id;
      let removeTimer = noop;

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
        const timer = setTimeout(() => {
          removeTimer();
          reject(new ETimeout());
        }, timeout);
        removeTimer = () => {
          clearTimeout(timer);
        }
      }
    });
  }

  publish(method, params = []) {
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
