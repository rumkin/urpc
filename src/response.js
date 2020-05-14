import {
  formatError,
  formatResponse
} from './utils.js'

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
