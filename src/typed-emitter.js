export class TypedEmitter {
  constructor(events) {
    this.listeners = events.reduce((result, name) => {
      result[name] = [];
      return result;
    }, {});
  }

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

    for (const listener of this.listeners[event]) {
      if (listener.call(this, ...args) === false) {
        return false
      }
    }

    return true;
  }
}
