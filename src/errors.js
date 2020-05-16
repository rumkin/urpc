
export const ERR_CODES = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
})

export const ERR_MESSAGES = Object.freeze({
  [ERR_CODES.PARSE_ERROR]: 'Parse Error',
  [ERR_CODES.METHOD_NOT_FOUND]: 'Method Not Found',
  [ERR_CODES.INVALID_REQUEST]: 'Invalid Request',
  [ERR_CODES.INVALID_PARAMS]: 'Invalid Params',
  [ERR_CODES.INTERNAL_ERROR]: 'Internal Error',
});

export class UrpcError extends Error {}

export class UrpcProtocolError extends UrpcError {
  constructor({code, message, data = {}} = {}) {
    super();

    this.code = code;
    this.message = typeof message === "undefined" ? ERR_MESSAGES[code] : message;
    this.data = data;
  }

  toString() {
    return `[${this.code}] ${this.message}`;
  }

  toJSON() {
    return {
      ...this,
    };
  }
}

export function protocolErrorFrom({code, data}) {
  switch (code) {
    case ERR_CODES.METHOD_NOT_FOUND:
      return new EMethodNotFound(data);
    case ERR_CODES.INTERNAL_ERROR:
      return new EInternalError(data);
    case ERR_CODES.EInvalidParams:
      return new EInvalidParams(data);
    case ERR_CODES.INVALID_REQUEST:
      return new EInvalidRequest(data);
    case ERR_CODES.PARSE_ERROR:
      return new EParseError(data);
    default:
      throw new EUnknownErrorCode({code});
  }
}

export class EUnknownErrorCode extends UrpcError {
  constructor({code}) {
    super(`Unknown error code: "${code}"`);

    this.data = {code};
  }
}

export class EClosed extends UrpcError {
  constructor() {
    super('Closed');
  }
}

export class ETimeout extends UrpcError {
  constructor() {
    super('Timeout');
  }
}

export class EUnkownMessageId extends UrpcError {
  constructor({id}) {
    super(`Unknown message ID: ${id}`);
    this.data = {id};
  }
}

export class EParseError extends UrpcProtocolError {
  constructor() {
    super({
      code: ERR_CODES.PARSE_ERROR,
      data: {},
    });
  }
}

export class EMethodNotFound extends UrpcProtocolError {
  /**
   * @param {Object} options Constructor options.
   * @param {string} options.method Method name.
   */
  constructor({method}) {
    super({
      code: ERR_CODES.METHOD_NOT_FOUND,
      data: {method},
    });
  }
}

export class EInternalError extends UrpcProtocolError {
  /**
   * @param {Object} data Internal error data
   */
  constructor(data) {
    super({
      code: ERR_CODES.INTERNAL_ERROR,
      data,
    });
  }
}

export class EInvalidParams extends UrpcProtocolError {
  /**
   * @param {Object} options Constructor options.
   * @param {Array<*>} options.params Params value.
   */
  constructor({params}) {
    super({
      code: ERR_CODES.INVALID_PARAMS,
      data: {params},
    });
  }
}

export class EInvalidRequest extends UrpcProtocolError {
  /**
   * @param {*} message Invalid message
   */
  constructor({message}) {
    super({
      code: ERR_CODES.INVALID_REQUEST,
      data: {message},
    });
  }
}
