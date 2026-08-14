import express from 'express';

import { AuthError } from '../../../../Auth.mjs';
import Auth from '../../../../../services/Auth.mjs';

export default express()

  // getAuthState
  .get('/state', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(await Auth.getState(req));
  })

  // onboard
  .post('/onboarding', async (req, res) => {
    try {
      const user = await Auth.onboard(req.body ?? {});
      const session = await Auth.createSession(user);
      Auth.setSessionCookie(res, req, session);
      res.set('Cache-Control', 'no-store');
      res.status(201).json(authenticatedState(user));
    } catch (error) {
      sendAuthError(res, error);
    }
  })

  // login
  .post('/login', async (req, res) => {
    try {
      const user = await Auth.login(req.body ?? {});
      const session = await Auth.createSession(user);
      Auth.setSessionCookie(res, req, session);
      res.set('Cache-Control', 'no-store');
      res.status(200).json(authenticatedState(user));
    } catch (error) {
      sendAuthError(res, error);
    }
  })

  // logout
  .post('/logout', async (req, res) => {
    await Auth.logout(req);
    Auth.clearSessionCookie(res, req);
    res.set('Cache-Control', 'no-store');
    res.status(204).send();
  });

function authenticatedState(user) {
  return {
    onboardingRequired: false,
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
    },
  };
}

function sendAuthError(response, error) {
  if (error instanceof AuthError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Authentication failed.' });
}
