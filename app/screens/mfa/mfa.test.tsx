// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, waitFor} from '@testing-library/react-native';

import {login} from '@actions/remote/session';
import {Preferences} from '@constants';
import {navigateBack, navigateToScreen} from '@screens/navigation';
import LoginCredentialsStore from '@store/login_credentials_store';
import {renderWithIntlAndTheme} from '@test/intl-test-helper';

import MfaScreen from './index';

jest.mock('@actions/remote/session', () => ({
    login: jest.fn(),
}));

jest.mock('@hooks/android_back_handler');

jest.mock('@hooks/screen_transition_animation', () => ({
    useScreenTransitionAnimation: jest.fn(() => ({})),
}));

jest.mock('@screens/navigation', () => ({
    navigateBack: jest.fn(),
    navigateToScreen: jest.fn(),
}));

describe('MfaScreen', () => {
    const baseProps = {
        config: {},
        launchError: false,
        launchType: 'normal' as const,
        license: {},
        serverDisplayName: 'Server',
        serverUrl: 'https://server.example.com',
        theme: Preferences.THEMES.denim,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(login).mockResolvedValue({failed: false});
    });

    afterEach(() => {
        LoginCredentialsStore.clearCredentials();
    });

    it('logs in with the stored credentials exactly as entered', async () => {
        LoginCredentialsStore.setCredentials({loginId: 'user', password: 'Fall%2025!'});
        const {getByTestId} = renderWithIntlAndTheme(<MfaScreen {...baseProps}/>);

        fireEvent.changeText(getByTestId('login_mfa.input'), '123456');
        fireEvent.press(getByTestId('login_mfa.submit'));

        await waitFor(() => {
            expect(login).toHaveBeenCalledWith(baseProps.serverUrl, expect.objectContaining({
                loginId: 'user',
                password: 'Fall%2025!',
                mfaToken: '123456',
            }));
        });
        expect(navigateToScreen).toHaveBeenCalled();
    });

    it('navigates back without logging in when no credentials are stored', async () => {
        const {getByTestId} = renderWithIntlAndTheme(<MfaScreen {...baseProps}/>);

        fireEvent.changeText(getByTestId('login_mfa.input'), '123456');
        fireEvent.press(getByTestId('login_mfa.submit'));

        await waitFor(() => {
            expect(navigateBack).toHaveBeenCalled();
        });
        expect(login).not.toHaveBeenCalled();
    });

    it('clears the stored credentials on unmount', () => {
        LoginCredentialsStore.setCredentials({loginId: 'user', password: 'secret'});
        const {unmount} = renderWithIntlAndTheme(<MfaScreen {...baseProps}/>);

        expect(LoginCredentialsStore.getCredentials()).toBeDefined();
        unmount();
        expect(LoginCredentialsStore.getCredentials()).toBeUndefined();
    });
});
