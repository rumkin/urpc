/* global describe it */
import should from 'should'

import {
  Connection,
  EMethodNotFound,
  EClosed,
  ERR_CODES,
  ERR_MESSAGES,
} from '../src/index.js'

describe('μRPC', function() {
  describe('Connection', function() {
    it('Should receive request and return result', async function() {
      const stream = new Connection(async ({req, res}) => {
        res.result = req.params[0];
      }, {codec: null});

      const result = await new Promise((resolve, reject) => {
        stream.on('message', (msg) => {
          stream.end();
          resolve(msg);
        });
        stream.on('error', reject);

        stream.write({
          jsonrpc: '1.0',
          id: 1,
          method: 'test',
          params: [1],
        });
      });

      should(result).be.deepEqual({
        jsonrpc: '1.0',
        id: 1,
        result: 1,
      });
    });

    it('Should receive request and return error if method not found', async function() {
      const stream = new Connection({codec: null});

      const result = await new Promise((resolve, reject) => {
        stream.on('message', (msg) => {
          stream.end();
          resolve(msg);
        });
        stream.on('error', reject);

        stream.write({
          jsonrpc: '1.0',
          id: 1,
          method: 'test',
          params: [],
        });
      });

      should(result).be.deepEqual({
        jsonrpc: '1.0',
        id: 1,
        error: {
          code: ERR_CODES.METHOD_NOT_FOUND,
          message: ERR_MESSAGES[ERR_CODES.METHOD_NOT_FOUND],
          data: {method: 'test'}
        }
      });
    });

    it('Should send request and receive response', async function() {
      const stream = new Connection({codec: null});

      const result = await new Promise((resolve, reject) => {
        stream.on('message', ({id}) => {
          setTimeout(() => {
            stream.write({
              jsonrpc: '1.0',
              id,
              result: true
            });
          });
        });
        stream.on('error', reject);

        stream.call('test', [])
        .then(resolve, reject);
      });

      should(result).be.true();
    });

    it('Should send request and receive error', async function() {
      const stream = new Connection();

      const result = await new Promise((resolve, reject) => {
        stream.on('message', (message) => {
          const {id, method} = JSON.parse(message);

          setTimeout(() => {
            stream.write(JSON.stringify({
              jsonrpc: '1.0',
              id,
              error: new EMethodNotFound({method}),
            }));
          });
        });
        stream.on('error', reject);

        stream.call('test', [])
        .then(() => {
          reject(new Error('Result returned'))
        }, resolve);
      });

      should(result).be.instanceOf(EMethodNotFound)
      .and.has.ownProperty('data').which.deepEqual({
        method: 'test',
      });
    });

    describe('#end()', function() {
      it('Should wait all incoming requests', async function () {
        const a = new Connection({codec: null});
        const b = new Connection(async ({req, res}) => {
          // Delay test execution to let b.end triggered before the response is sent
          await timeout(10);
          res.result = req.params[0];
        }, {codec: null});

        a.on('message', (msg) => setTimeout(() => b.write(msg),))
        b.on('message', (msg) => setTimeout(() => a.write(msg)))

        const result = await new Promise((resolve, reject) => {
          Promise.all([
            a.call('test', [1]),
            a.call('test', [2]),
          ])
          .then(resolve, reject)

          timeout()
          .then(() => {
            b.end();
          })
          .catch(reject);
        });

        should(result).be.deepEqual([
          1, 2
        ]);
      });

      it('Should wait all outgoing requests', async function () {
        const a = new Connection({codec: null});
        const b = new Connection(async ({req, res}) => {
          await timeout(10);
          res.result = req.params[0];
        }, {codec: null});

        a.on('message', (msg) => setTimeout(() => b.write(msg)))
        b.on('message', (msg) => setTimeout(() => a.write(msg)))

        const result = await new Promise((resolve, reject) => {
          Promise.all([
            a.call('test', [1]),
            a.call('test', [2]),
          ])
          .then(resolve, reject);

          a.end();
        });

        should(result).be.deepEqual([
          1, 2
        ]);
      });
    });

    describe('#close()', function() {
      it('Should reject pending calls with EClosed error', async () => {
        const a = new Connection({codec: null});
        const b = new Connection(async ({req, res}) => {
          await timeout(10);
          res.result = req.params[0];
        }, {codec: null});

        a.on('message', (msg) => setTimeout(() => b.write(msg)));
        b.on('message', (msg) => setTimeout(() => {
          if (! a.isClosed) {
            a.write(msg);
          }
        }));

        const result = await new Promise((resolve, reject) => {
          a.call('test', [1])
          .then(() => {
            reject(new Error('Result'))
          })
          .catch(resolve);

          timeout()
          .then(() => {
            a.close();
          })
          .catch(reject);
        });

        should(result).be.instanceof(EClosed);
      });
    })
  });
});

function timeout(delay, ...args) {
  return new Promise((resolve) => setTimeout(resolve, delay, ...args))
}
