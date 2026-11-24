import { AuthController, UI_ACCESS_COOKIE } from './auth.controller';

describe('AuthController decoy routing marker', () => {
  const originalDecoy = process.env.PANEL_DECOY;
  const originalEnv = process.env.NODE_ENV;
  let cookie: jest.Mock;
  let clearCookie: jest.Mock;
  let controller: AuthController;
  let auth: { login: jest.Mock; refresh: jest.Mock; logout: jest.Mock; me: jest.Mock };

  beforeEach(() => {
    cookie = jest.fn();
    clearCookie = jest.fn();
    auth = {
      login: jest.fn().mockResolvedValue({ accessToken: 'a' }),
      refresh: jest.fn().mockResolvedValue({ accessToken: 'a' }),
      logout: jest.fn().mockResolvedValue({ ok: true }),
      me: jest.fn(),
    };
    controller = new AuthController(auth as never);
  });

  afterEach(() => {
    if (originalDecoy === undefined) delete process.env.PANEL_DECOY;
    else process.env.PANEL_DECOY = originalDecoy;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('sets a routing-only cookie on login and refresh when decoy mode is on', async () => {
    process.env.PANEL_DECOY = 'true';
    process.env.NODE_ENV = 'test';
    const res = { cookie, clearCookie } as never;

    const login = await controller.login({ email: 'a@b.co', password: 'password123' } as never, res);
    const refresh = await controller.refresh({ refreshToken: 'r' } as never, res);

    expect(login).toEqual({ accessToken: 'a' });
    expect(refresh).toEqual({ accessToken: 'a' });
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie).toHaveBeenCalledWith(UI_ACCESS_COOKIE, '1', expect.objectContaining({
      httpOnly: true, sameSite: 'lax', secure: false, path: '/',
    }));
  });

  it('does not set the cookie when decoy mode is off', async () => {
    delete process.env.PANEL_DECOY;
    await controller.login({ email: 'a@b.co', password: 'password123' } as never, { cookie, clearCookie } as never);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('clears the cookie on logout', async () => {
    await controller.logout({ refreshToken: 'r' } as never, { cookie, clearCookie } as never);
    expect(clearCookie).toHaveBeenCalledWith(UI_ACCESS_COOKIE, { path: '/' });
  });
});
