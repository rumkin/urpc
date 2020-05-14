export class UrpcRequest {
  constructor({id, method, params = [], jsonrpc}) {
    this.id = id;
    this.method = method;
    this.params = params;
    this.version = jsonrpc;
  }
}
