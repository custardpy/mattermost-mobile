// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import LoginCredentialsStore from './login_credentials_store';

describe('LoginCredentialsStore', () => {
    afterEach(() => {
        LoginCredentialsStore.clearCredentials();
    });

    it('should start empty', () => {
        expect(LoginCredentialsStore.getCredentials()).toBeUndefined();
    });

    it('should return credentials exactly as set', () => {
        const credentials = {loginId: 'user%40example.com', password: 'Fall%2025!'};
        LoginCredentialsStore.setCredentials(credentials);

        expect(LoginCredentialsStore.getCredentials()).toEqual({loginId: 'user%40example.com', password: 'Fall%2025!'});
    });

    it('should replace previously set credentials', () => {
        LoginCredentialsStore.setCredentials({loginId: 'first', password: 'one'});
        LoginCredentialsStore.setCredentials({loginId: 'second', password: 'two'});

        expect(LoginCredentialsStore.getCredentials()).toEqual({loginId: 'second', password: 'two'});
    });

    it('should clear credentials', () => {
        LoginCredentialsStore.setCredentials({loginId: 'user', password: 'secret'});
        LoginCredentialsStore.clearCredentials();

        expect(LoginCredentialsStore.getCredentials()).toBeUndefined();
    });
});
