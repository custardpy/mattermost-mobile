// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Holds the credentials entered on the login screen while the user completes MFA.
// Credentials must not travel through navigation params: those are URL-decoded,
// which corrupts passwords containing percent-encoded sequences (e.g. "%20").
export type LoginCredentials = {
    loginId: string;
    password: string;
};

class LoginCredentialsStoreSingleton {
    private credentials?: LoginCredentials;

    public setCredentials(credentials: LoginCredentials) {
        this.credentials = credentials;
    }

    public getCredentials(): LoginCredentials | undefined {
        return this.credentials;
    }

    public clearCredentials() {
        this.credentials = undefined;
    }
}

const LoginCredentialsStore = new LoginCredentialsStoreSingleton();
export default LoginCredentialsStore;
