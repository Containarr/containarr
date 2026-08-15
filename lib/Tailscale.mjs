import Settings from '../services/Settings.mjs';

export default class Tailscale {

  async getSettings() {
    const [clientId, clientSecret] = await Promise.all([
      Settings.getSetting('tailscaleClientId'),
      Settings.getSetting('tailscaleClientSecret'),
    ]);
    return {
      clientId: clientId ?? '',
      clientSecretConfigured: Boolean(clientSecret),
    };
  }

  async setSettings({ clientId, clientSecret }) {
    if (clientId === '' && clientSecret === '') {
      await Promise.all([
        Settings.unsetSetting('tailscaleClientId'),
        Settings.unsetSetting('tailscaleClientSecret'),
      ]);
      return this.getSettings();
    }
    if (typeof clientId !== 'string' || !clientId) {
      throw new Error('Client ID is required.');
    }
    if (typeof clientSecret !== 'string') {
      throw new Error('Client Secret is required.');
    }
    const existingSecret = await Settings.getSetting('tailscaleClientSecret');
    if (!clientSecret && !existingSecret) {
      throw new Error('Client Secret is required.');
    }
    await Settings.setSetting('tailscaleClientId', clientId);
    if (clientSecret) await Settings.setSetting('tailscaleClientSecret', clientSecret);
    return this.getSettings();
  }

  async getDevices() {
    const clientId = await Settings.getSetting('tailscaleClientId');
    const clientSecret = await Settings.getSetting('tailscaleClientSecret');
    if (!clientId || !clientSecret) {
      throw new Error('Configure Tailscale credentials first.');
    }

    const tokenResponse = await fetch('https://api.tailscale.com/api/v2/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'devices:core:read',
      }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(token.error_description || token.error || 'Tailscale authentication failed.');
    }

    const devicesResponse = await fetch('https://api.tailscale.com/api/v2/tailnet/-/devices', {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });
    const devices = await devicesResponse.json();
    if (!devicesResponse.ok) {
      throw new Error(devices.message || 'Unable to retrieve Tailscale devices.');
    }
    return (devices.devices ?? []).map(device => ({
      id: device.id,
      name: device.name,
      hostname: device.hostname,
      addresses: device.addresses ?? [],
      os: device.os,
      lastSeen: device.lastSeen,
    }));
  }

}
