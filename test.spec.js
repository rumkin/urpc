const should = require('should');

const {RpcStream} = require('./');

describe('μRPC', function() {
    it('Should receive request and return result', async function() {
        const stream = new RpcStream(async (self, req, res) => {
            res.result = req.params[0];
        });

        const result = await new Promise((resolve, reject) => {
            stream.on('data', (msg) => {
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
});
