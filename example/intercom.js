const {RpcStream, RpcError, METHOD_NOT_FOUND, INTERNAL_ERROR} = require('../');

const handler = {
    get(target, name) {
        return new Proxy(target.bind(null, name), handler);
    },

    apply(target, thisArg, args) {
        return target(args);
    },
};

function createApi(stream) {
    return new Proxy((...args) => {
        const params = args.pop();
        return stream.call(args.join('.'), params);
    }, handler);
}

function handleRequest(req, res, handlers) {
    let methodExists = true;
    try {
        if (handlers.hasOwnProperty(req.method)) {
            return handlers[req.method](...req.params);
        }
        else if (handlers.hasOwnProperty('*')) {
            return handlers['*'](req.method, ...req.params);
        }
        else {
            methodExists = false;
        }
    }
    catch (err) {
        res.error = new RpcError({
            code: INTERNAL_ERROR,
            data: {
                message: err.message,
            },
        });
        return;
    }

    if (! methodExists) {
        throw new RpcError({
            code: METHOD_NOT_FOUND,
            data: {method: req.method},
        });
    }
}
// ------

const s1 = new RpcStream(async (stream, req, res) => {
    const s2 = createApi(stream);

    res.result = await handleRequest(req, res, {
        async calculate(a) {
            return s2.count(a);
        },
        async increase(a) {
            return a + 1;
        },
    });
});

const s2 = new RpcStream(async (stream, req, res) => {
    const s1 = createApi(stream);

    res.result = await handleRequest(req, res, {
        async count(a) {
            let i = a;

            i = await s1.increase(i);
            i = await s1.increase(i);
            i = await s1.increase(i);

            return i;
        },
    });
});

s1.on('data', (data) => s2.write(data));
s1.on('error', (error) => console.error('stream 1', error));

s2.on('data', (data) => s1.write(data));
s2.on('error', (error) => console.error('stream 2', error));

async function run() {
    const result = await s2.call('calculate', [0]);

    console.log('Result =', result);
}

run()
.catch((error) => {
    console.error(error);
    return 1;
})
.then((code = 0) => process.exit(code));
