const DEFAULT_FETCH_HEADERS = {
    'content-type': 'application/json',
}

const DEFAULT_FETCH_OPTIONS = {
    'credentials': 'include',
}
function _generateUID(length) {
    length = length || 40;

    var s = '0123456789abcdef',
        uuid = new Array(length);
    for (var i = 0; i < length; i++) {
        uuid[i] = s.charAt(Math.ceil(Math.random() * 15));
    }
    return uuid.join('');
}

export default class RPCAdapter {
    #headers;
    #method;
    #timeout;
    #otherOptions;
    #url;
    #generateUID;
    #jsonKey;
    static #counter = 0;
    static #allowConstruction = false;

    constructor(url=null, jsonKey=null, { timeout = 8000, method = 'POST', generateUID = _generateUID, headers = {}, otherOptions = {} } = {}) {
        if (RPCAdapter._instance && !RPCAdapter.#allowConstruction) {
            console.warn('Singletons cannot be created twice');
            return RPCAdapter._instance;
        }
        this.#timeout = timeout;
        this.#method = method;
        this.#headers = headers;
        this.#otherOptions = otherOptions;
        this.#jsonKey = jsonKey;
        this.#generateUID = generateUID;
        this.#url = url;
        if (!RPCAdapter._instance) RPCAdapter._instance = this;
    }

    clone() {
        RPCAdapter.#allowConstruction = true;
        const clone = new RPCAdapter();
        RPCAdapter.#allowConstruction = false;
        clone
            .setHeaders({...this.#headers})
            .setMethod(this.#method)
            .set_Timeout(this.#timeout)
            .setOtherOptions({...this.#otherOptions})
            .setUrl(this.#url)
            .setUIDGenerator(this.#generateUID)
            .setJsonKey(this.#jsonKey);

        return clone;

    }

    createRequest() {
        return this.clone;
    }

    createNewInstance(url, jsonKey, {timeout = 8000, method = 'POST', generateUID = _generateUID, headers={}, otherOptions={}} = {}) {
        if( !url || !jsonKey){
            throw new Error('Url and/or JsonKey missing. These are required to initialize new instance');
        }
        RPCAdapter.#allowConstruction = true;
        const instance = new RPCAdapter(url, jsonKey, {timeout, method, generateUID, headers, otherOptions});
        RPCAdapter.#allowConstruction = false;
        return instance;
    }

    setHeaders(headers) {
        const _headers = {};
        Object.keys(headers).forEach(function(key, index){
            _headers[key.toLowerCase()] = val;
        })
        this.#headers = {
            ..._headers
        };
        return this;
    }

    setOtherOptions(options) {
        delete options.headers;
        delete options.method;
        delete options.body;
        this.#otherOptions = {
            ...options
        }
        return this;
    }

    set_Timeout(timeout) {
        if (typeof timeout !== 'number') {
            throw new Error('Timeout(ms) has to be a valid number')
        }
        this.#timeout = timeout;
        return this;
    }

    setUrl(url) {
        if (url) {
            this.#url = url;
        }
        return this;
    }

    setUIDGenerator(generateUID) {
        this.#generateUID = generateUID;
        return this;
    }

    setJsonKey(key) {
        this.#jsonKey = key;
        return this;
    }

    #buildFetchArgs() {
        const options = {
            method: this.#method,
            headers: {
                ...DEFAULT_FETCH_HEADERS,
                ...this.#headers,
            },
            ...DEFAULT_FETCH_OPTIONS,
            ...this.#otherOptions,
        }

        const jsonKey = this.#jsonKey || Tine.Tinebase.registry && Tine.Tinebase.registry.get ? Tine.Tinebase.registry.get('jsonKey') : '';
        const transactionId = this.#generateUID ? this.#generateUID() : Tine.Tinebase.data.Record.generateUID();
        options.headers['x-tine20-transactionid'] = transactionId;
        options.headers['x-tine20-jsonkey'] = jsonKey;

        const url = this.#url || Tine.Tinebase.tineInit.requestUrl;
        const fetchResource = `${url}?transactionid=${transactionId}`;

        return {
            fetchResource,
            options
        }
    }

    async #fetch(body) {
        const controller = new AbortController();

        const args = this.#buildFetchArgs();
        args.options.body = JSON.stringify(body);

        const id = setTimeout(() => {
            controller.abort()
        }, this.#timeout);

        const response = await fetch(args.fetchResource, {
            ...args.options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    }

    build() {
        return this.rpc;
    }

    get rpc() {
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (prop === 'createRequest') {
                    return this.createRequest;
                } else if (prop === 'createNewInstance') {
                    return this.createNewInstance;
                }
                const appName = prop;

                return new Proxy(this, {
                    get: (target, prop, receiver) => {
                        const methodName = `${appName}.${prop}`;

                        return (...params) => {

                            const requestBody = {
                                jsonrpc: '2.0',
                                method: methodName,
                                params: params,
                                id: ++RPCAdapter.#counter
                            }

                            return new Promise((resolve, reject) => {
                                this.#fetch(requestBody)
                                    .then(resp => {
                                        resp.json().then(jsonResponse => {
                                            resolve(jsonResponse.result)
                                        })
                                    })
                                    .catch(error => {
                                        reject(error);
                                    })
                            })
                        }
                    }
                })
            }

        })
    }
}