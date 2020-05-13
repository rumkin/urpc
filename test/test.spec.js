/* global describe it */
import should from 'should'

import {
  UrpcStream,
  EMethodNotFound,
  ERR_CODES,
  ERR_MESSAGES,
} from '../src/index.js'

describe('μRPC', function() {
  it('Should receive request and return result', async function() {
    const stream = new UrpcStream(async ({req, res}) => {
      res.result = req.params[0];
    });

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
    const stream = new UrpcStream();

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
    const stream = new UrpcStream();

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
    const stream = new UrpcStream();

    const result = await new Promise((resolve, reject) => {
      stream.on('message', ({id, method}) => {
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
});
