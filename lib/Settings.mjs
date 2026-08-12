import debug from 'debug';

import SQLite from '../services/SQLite.mjs';

export default class Settings {

  debug = debug('Settings');

  async getSetting(key) {
    const Setting = await SQLite.getModelSetting();
    const setting = await Setting.findOne({ where: { key } });
    return setting?.value ?? null;
  }

  async setSetting(key, value) {
    const Setting = await SQLite.getModelSetting();
    const [setting, created] = await Setting.findOrCreate({ where: { key }, defaults: { value } });
    if (!created) {
      setting.value = value;
      await setting.save();
    }
  }

}