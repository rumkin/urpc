import {
    Connection,
    EInternalError,
} from 'urpc'

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
    try {
        if (handlers.hasOwnProperty(req.method)) {
            return handlers[req.method](...req.params);
        }
        else if (handlers.hasOwnProperty('*')) {
            return handlers['*'](req.method, ...req.params);
        }
    }
    catch (err) {
        if ('toJSON' in err) {
            res.error = new EInternalError({
                ...err.toJSON(),
            });
        }
        else {
            res.error = new EInternalError({
                message: err.message,
                stack: err.stack,
            })
        }
    }
}
// ------

async function run() {
    const s1 = new Connection(async function ({req, res}) {
        const remote = createApi(this);

        res.result = await handleRequest(req, res, {
            async calculate(a) {
                return remote.count(a);
            },
            async increase(a) {
                return a + 1;
            },
        });
    }, {codec: null});

    const s2 = new Connection(async function ({req, res}) {
        const remote = createApi(this);

        res.result = await handleRequest(req, res, {
            async count(a) {
                let i = a;

                i = await remote.increase(i);
                i = await remote.increase(i);
                i = await remote.increase(i);

                return i;
            },
        });
    }, {codec: null});

    s1.on('data', (data) => s2.write(data));
    s1.on('error', (error) => console.error('stream 1', error));

    s2.on('data', (data) => s1.write(data));
    s2.on('error', (error) => console.error('stream 2', error));

    const result = await s2.call('calculate', [0]);

    console.log('Result =', result);
}

run()
.catch((error) => {
    console.error(error);
    return 1;
})
.then((code = 0) => process.exit(code));
