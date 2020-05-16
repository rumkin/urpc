
function isObject(value) {
  return value !== null && typeof value === 'object';
}

function isObjectInstance(value) {
  return value.constructor === Object
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

export function isId(id) {
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

export function isMessage(message) {
  if (! isObject(message) || ! isObjectInstance(message)) {
    return false;
  }

  if (message.jsonrpc !== "1.0") {
    return false;
  }

  return true;
}

export function isRequestMessage(message) {
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

export function isErrorMessage(message) {
  if ('id' in message) {
    if (! isId(message.id)) {
      return false;
    }
  }

  if (! (isObject(message.error) && isObjectInstance(message.error))) {
    return false;
  }

  const error = message.error;
  const code = error.code;

  if (! (isNumber(code) && isRealNumber(code)) && ! (isString(code) && isNonEmptyString(code))) {
    return false;
  }
  else if (! (isString(error.message) && isNonEmptyString(error.message))) {
    return false;
  }
  else if ('data' in error) {
    if (! (isObject(error.data) && isObjectInstance(error.data))) {
      return false;
    }
  }

  return true;
}

export function formatRequest(id, {method, params = []}) {
  return {
    jsonrpc: '1.0',
    id,
    method,
    params,
  };
}

export function formatResponse(id, result = null) {
  return {
    jsonrpc: '1.0',
    id,
    result,
  };
}

export function formatError(id, {code, message, data}) {
  return {
    jsonrpc: '1.0',
    id,
    error: {code, message, data},
  };
}
