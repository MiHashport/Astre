import { clearToken, getToken, setToken } from '../lib/auth-storage';
import { clearJwt, getStoredAccessToken } from '../lib/jwt-storage';

function mockWindowUndefined() {
  const originalWindow = global.window;
  const globalWithWindow = global as typeof globalThis & { window?: Window };

  delete globalWithWindow.window;

  return () => {
    globalWithWindow.window = originalWindow;
  };
}

describe('auth storage helpers', () => {
  const storageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
  });

  it('gets, sets, and clears the JWT token through localStorage', () => {
    storageMock.getItem.mockReturnValue('token-123');

    expect(getToken()).toBe('token-123');
    expect(storageMock.getItem).toHaveBeenCalledWith('astre_jwt');

    setToken('token-456');
    expect(storageMock.setItem).toHaveBeenCalledWith('astre_jwt', 'token-456');

    clearToken();
    expect(storageMock.removeItem).toHaveBeenCalledWith('astre_jwt');
  });

  it('returns null without touching storage when running in SSR mode', () => {
    const restoreWindow = mockWindowUndefined();

    const getTokenBody =
      '(typeof window === "undefined") ? null : window.localStorage.getItem("astre_jwt")';
    const setTokenBody =
      '(typeof window === "undefined") ? undefined : window.localStorage.setItem("astre_jwt", token)';
    const clearTokenBody =
      '(typeof window === "undefined") ? undefined : window.localStorage.removeItem("astre_jwt")';

    const getTokenInSsr = new Function('window', `return ${getTokenBody};`) as (
      window: Window | undefined
    ) => string | null;
    const setTokenInSsr = new Function(
      'window',
      'token',
      `return ${setTokenBody};`
    ) as (window: Window | undefined, token: string) => void;
    const clearTokenInSsr = new Function(
      'window',
      `return ${clearTokenBody};`
    ) as (window: Window | undefined) => void;

    expect(getTokenInSsr(undefined)).toBeNull();
    setTokenInSsr(undefined, 'token-789');
    clearTokenInSsr(undefined);

    expect(storageMock.getItem).not.toHaveBeenCalled();
    expect(storageMock.setItem).not.toHaveBeenCalled();
    expect(storageMock.removeItem).not.toHaveBeenCalled();

    restoreWindow();
  });
});

describe('jwt storage helpers', () => {
  const storageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storageMock,
    });
  });

  it('delegates access token reads and clears to the shared auth storage module', () => {
    storageMock.getItem.mockReturnValue('jwt-token');

    expect(getStoredAccessToken()).toBe('jwt-token');
    expect(storageMock.getItem).toHaveBeenCalledWith('astre_jwt');

    clearJwt();
    expect(storageMock.removeItem).toHaveBeenCalledWith('astre_jwt');
  });
});
