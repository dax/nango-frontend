export declare class AuthError extends Error {
    type: string;
    constructor(message: string, type: string);
}
export type AuthResult = {
    providerConfigKey: string;
    connectionId: string;
    isPending?: boolean;
};
interface AuthOptions {
    detectClosedAuthWindow?: boolean;
}
export default class Nango {
    private hostBaseUrl;
    private websocketsBaseUrl;
    private status;
    private publicKey;
    private debug;
    win: null | AuthorizationModal;
    private width;
    private height;
    private tm;
    constructor(config: {
        host?: string;
        websocketsPath?: string;
        publicKey: string;
        width?: number;
        height?: number;
        debug?: boolean;
    });
    create(providerConfigKey: string, connectionId: string, connectionConfig?: ConnectionConfig): Promise<AuthResult>;
    auth(providerConfigKey: string, connectionId: string, options?: (ConnectionConfig | BasicApiCredentials | ApiKeyCredentials | AppStoreCredentials) & AuthOptions): Promise<AuthResult>;
    private convertCredentialsToConfig;
    private customAuth;
    private toQueryString;
}
interface ConnectionConfig {
    params?: Record<string, string>;
    hmac?: string;
    user_scope?: string[];
    authorization_params?: Record<string, string | undefined>;
    credentials?: BasicApiCredentials | ApiKeyCredentials | AppStoreCredentials;
}
interface BasicApiCredentials {
    username?: string;
    password?: string;
}
interface ApiKeyCredentials {
    apiKey?: string;
}
interface AppStoreCredentials {
    privateKeyId: string;
    issuerId: string;
    privateKey: string;
    scope?: string[];
}
/**
 * AuthorizationModal class
 */
declare class AuthorizationModal {
    private url;
    private features;
    private width;
    private height;
    modal: Window | null;
    private swClient;
    private debug;
    isProcessingMessage: boolean;
    constructor(webSocketUrl: string, url: string, successHandler: (providerConfigKey: string, connectionId: string) => any, errorHandler: (errorType: string, errorDesc: string) => any, { width, height }: {
        width?: number | null;
        height?: number | null;
    }, debug?: boolean);
    /**
     * Handles the messages received from the Nango server via WebSocket.
     */
    handleMessage(message: MessageEvent<any>, successHandler: (providerConfigKey: string, connectionId: string) => any, errorHandler: (errorType: string, errorDesc: string) => any): void;
    /**
     * The modal is expected to be in the center of the screen.
     */
    layout(expectedWidth: number, expectedHeight: number): {
        left: number;
        top: number;
        computedWidth: number;
        computedHeight: number;
    };
    /**
     * Open the modal
     */
    open(wsClientId: string): Window | null;
    /**
     * Helper to convert the features object of this class
     * to the comma-separated list of window features required
     * by the window.open() function.
     */
    featuresToString(): string;
}
export {};
