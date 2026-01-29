/*
 * Copyright (c) 2023 Nango, all rights reserved.
 */
const prodHost = 'https://api.nango.dev';
const debugLogPrefix = 'NANGO DEBUG LOG: ';
export class AuthError extends Error {
    type;
    constructor(message, type) {
        super(message);
        this.type = type;
    }
}
export default class Nango {
    hostBaseUrl;
    websocketsBaseUrl;
    status;
    publicKey;
    debug = false;
    win = null;
    width = null;
    height = null;
    tm = null;
    constructor(config) {
        config.host = config.host || prodHost; // Default to Nango Cloud.
        config.websocketsPath = config.websocketsPath || '/'; // Default to root path.
        this.debug = config.debug || false;
        if (this.debug) {
            console.log(debugLogPrefix, `Debug mode is enabled.`);
            console.log(debugLogPrefix, `Using host: ${config.host}.`);
        }
        if (config.width) {
            this.width = config.width;
        }
        if (config.height) {
            this.height = config.height;
        }
        this.hostBaseUrl = config.host.slice(-1) === '/' ? config.host.slice(0, -1) : config.host; // Remove trailing slash.
        this.status = AuthorizationStatus.IDLE;
        this.publicKey = config.publicKey;
        if (!config.publicKey) {
            throw new AuthError('You must specify a public key (cf. documentation).', 'missingPublicKey');
        }
        try {
            const baseUrl = new URL(this.hostBaseUrl);
            // Build the websockets url based on the host url.
            // The websockets path is considered relative to the baseUrl, and with the protocol updated
            const websocketUrl = new URL(config.websocketsPath, baseUrl);
            this.websocketsBaseUrl = websocketUrl.toString().replace('https://', 'wss://').replace('http://', 'ws://');
        }
        catch (err) {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }
    }
    async create(providerConfigKey, connectionId, connectionConfig) {
        const url = this.hostBaseUrl + `/unauth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            const errorResponse = await res.json();
            throw new AuthError(errorResponse.error, errorResponse.type);
        }
        return res.json();
    }
    auth(providerConfigKey, connectionId, options) {
        if (options && 'credentials' in options && Object.keys(options.credentials).length > 0) {
            const credentials = options.credentials;
            const { credentials: _, ...connectionConfig } = options;
            return this.customAuth(providerConfigKey, connectionId, this.convertCredentialsToConfig(credentials), connectionConfig);
        }
        const url = this.hostBaseUrl + `/oauth/connect/${providerConfigKey}${this.toQueryString(connectionId, options)}`;
        try {
            new URL(url);
        }
        catch (err) {
            throw new AuthError('Invalid URL provided for the Nango host.', 'invalidHostUrl');
        }
        return new Promise((resolve, reject) => {
            const successHandler = (providerConfigKey, connectionId, isPending = false) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }
                this.status = AuthorizationStatus.DONE;
                return resolve({
                    providerConfigKey: providerConfigKey,
                    connectionId: connectionId,
                    isPending
                });
            };
            const errorHandler = (errorType, errorDesc) => {
                if (this.status !== AuthorizationStatus.BUSY) {
                    return;
                }
                this.status = AuthorizationStatus.DONE;
                const error = new AuthError(errorDesc, errorType);
                return reject(error);
            };
            if (this.status === AuthorizationStatus.BUSY) {
                const error = new AuthError('The authorization window is already opened', 'windowIsOppened');
                reject(error);
            }
            // Save authorization status (for handler)
            this.status = AuthorizationStatus.BUSY;
            // Open authorization modal
            this.win = new AuthorizationModal(this.websocketsBaseUrl, url, successHandler, errorHandler, { width: this.width, height: this.height }, this.debug);
            if (options?.detectClosedAuthWindow || false) {
                this.tm = setInterval(() => {
                    if (!this.win?.modal?.window || this.win?.modal?.window.closed) {
                        if (this.win?.isProcessingMessage === true) {
                            // Modal is still processing a web socket message from the server
                            // We ignore the window being closed for now
                            return;
                        }
                        clearInterval(this.tm);
                        this.win = null;
                        this.status = AuthorizationStatus.CANCELED;
                        const error = new AuthError('The authorization window was closed before the authorization flow was completed', 'windowClosed');
                        reject(error);
                    }
                }, 500);
            }
        });
    }
    convertCredentialsToConfig(credentials) {
        const params = {};
        if ('username' in credentials) {
            params['username'] = credentials.username || '';
        }
        if ('password' in credentials) {
            params['password'] = credentials.password || '';
        }
        if ('apiKey' in credentials) {
            params['apiKey'] = credentials.apiKey || '';
        }
        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appStoreCredentials = {
                params: {
                    privateKeyId: credentials.privateKeyId,
                    issuerId: credentials.issuerId,
                    privateKey: credentials.privateKey
                }
            };
            if (credentials.scope) {
                appStoreCredentials.params['scope'] = credentials.scope;
            }
            return appStoreCredentials;
        }
        return { params };
    }
    async customAuth(providerConfigKey, connectionId, connectionConfigWithCredentials, connectionConfig) {
        const { params: credentials } = connectionConfigWithCredentials;
        if (!credentials) {
            throw new AuthError('You must specify credentials.', 'missingCredentials');
        }
        if ('apiKey' in credentials) {
            const apiKeyCredential = credentials;
            const url = this.hostBaseUrl + `/api-auth/api-key/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(apiKeyCredential)
            });
            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }
            return res.json();
        }
        if ('username' in credentials || 'password' in credentials) {
            const basicCredentials = credentials;
            const url = this.hostBaseUrl + `/api-auth/basic/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(basicCredentials)
            });
            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }
            return res.json();
        }
        if ('privateKeyId' in credentials && 'issuerId' in credentials && 'privateKey' in credentials) {
            const appCredentials = credentials;
            const url = this.hostBaseUrl + `/app-store-auth/${providerConfigKey}${this.toQueryString(connectionId, connectionConfig)}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appCredentials)
            });
            if (!res.ok) {
                const errorResponse = await res.json();
                throw new AuthError(errorResponse.error, errorResponse.type);
            }
            return res.json();
        }
        return Promise.reject('Something went wrong with the authorization');
    }
    toQueryString(connectionId, connectionConfig) {
        const query = [];
        if (connectionId) {
            query.push(`connection_id=${connectionId}`);
        }
        query.push(`public_key=${this.publicKey}`);
        if (connectionConfig) {
            for (const param in connectionConfig.params) {
                const val = connectionConfig.params[param];
                if (typeof val === 'string') {
                    query.push(`params[${param}]=${val}`);
                }
            }
            if (connectionConfig.hmac) {
                query.push(`hmac=${connectionConfig.hmac}`);
            }
            if (connectionConfig.user_scope) {
                query.push(`user_scope=${connectionConfig.user_scope.join(',')}`);
            }
            for (const param in connectionConfig.authorization_params) {
                const val = connectionConfig.authorization_params[param];
                if (typeof val === 'string') {
                    query.push(`authorization_params[${param}]=${val}`);
                }
                else if (val === undefined) {
                    query.push(`authorization_params[${param}]=undefined`);
                }
            }
        }
        return query.length === 0 ? '' : '?' + query.join('&');
    }
}
var AuthorizationStatus;
(function (AuthorizationStatus) {
    AuthorizationStatus[AuthorizationStatus["IDLE"] = 0] = "IDLE";
    AuthorizationStatus[AuthorizationStatus["BUSY"] = 1] = "BUSY";
    AuthorizationStatus[AuthorizationStatus["CANCELED"] = 2] = "CANCELED";
    AuthorizationStatus[AuthorizationStatus["DONE"] = 3] = "DONE";
})(AuthorizationStatus || (AuthorizationStatus = {}));
/**
 * AuthorizationModal class
 */
class AuthorizationModal {
    url;
    features;
    width = 500;
    height = 600;
    modal;
    swClient;
    debug;
    isProcessingMessage = false;
    constructor(webSocketUrl, url, successHandler, errorHandler, { width, height }, debug) {
        // Window modal URL
        this.url = url;
        this.debug = debug || false;
        const { left, top, computedWidth, computedHeight } = this.layout(width || this.width, height || this.height);
        // Window modal features
        this.features = {
            width: computedWidth,
            height: computedHeight,
            top,
            left,
            scrollbars: 'yes',
            resizable: 'yes',
            status: 'no',
            toolbar: 'no',
            location: 'no',
            copyhistory: 'no',
            menubar: 'no',
            directories: 'no'
        };
        this.swClient = new WebSocket(webSocketUrl);
        this.swClient.onmessage = (message) => {
            this.isProcessingMessage = true;
            this.handleMessage(message, successHandler, errorHandler);
            this.isProcessingMessage = false;
        };
    }
    /**
     * Handles the messages received from the Nango server via WebSocket.
     */
    handleMessage(message, successHandler, errorHandler) {
        const data = JSON.parse(message.data);
        switch (data.message_type) {
            case "connection_ack" /* WSMessageType.ConnectionAck */:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Connection ack received. Opening modal...');
                }
                const wsClientId = data.ws_client_id;
                this.open(wsClientId);
                break;
            case "error" /* WSMessageType.Error */:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Error received. Rejecting authorization...');
                }
                errorHandler(data.error_type, data.error_desc);
                this.swClient.close();
                break;
            case "success" /* WSMessageType.Success */:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Success received. Resolving authorization...');
                }
                successHandler(data.provider_config_key, data.connection_id);
                this.swClient.close();
                break;
            default:
                if (this.debug) {
                    console.log(debugLogPrefix, 'Unknown message type received from Nango server. Ignoring...');
                }
                return;
        }
    }
    /**
     * The modal is expected to be in the center of the screen.
     */
    layout(expectedWidth, expectedHeight) {
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const left = screenWidth / 2 - expectedWidth / 2;
        const top = screenHeight / 2 - expectedHeight / 2;
        const computedWidth = Math.min(expectedWidth, screenWidth);
        const computedHeight = Math.min(expectedHeight, screenHeight);
        return { left: Math.max(left, 0), top: Math.max(top, 0), computedWidth, computedHeight };
    }
    /**
     * Open the modal
     */
    open(wsClientId) {
        const url = this.url + '&ws_client_id=' + wsClientId;
        const windowName = '';
        const windowFeatures = this.featuresToString();
        this.modal = window.open(url, windowName, windowFeatures);
        return this.modal;
    }
    /**
     * Helper to convert the features object of this class
     * to the comma-separated list of window features required
     * by the window.open() function.
     */
    featuresToString() {
        const features = this.features;
        const featuresAsString = [];
        for (const key in features) {
            featuresAsString.push(key + '=' + features[key]);
        }
        return featuresAsString.join(',');
    }
}
//# sourceMappingURL=index.js.map