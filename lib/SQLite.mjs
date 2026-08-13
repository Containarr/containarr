import debug from 'debug';
import { Sequelize, DataTypes } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';

import Setting from './SQLite/Setting.mjs';
import App from './SQLite/App.mjs';
import Certificate from './SQLite/Certificate.mjs';
import Proxy from './SQLite/Proxy.mjs';

export default class SQLite {

  debug = debug('SQLite');

  #models = new Map();

  constructor() {
    this.sequelize = Promise.resolve().then(async () => {
      const sequelize = new Sequelize({
        dialect: SqliteDialect,
        storage: '/data/sqlite/db.sqlite',
        pool: {
          max: 1,
        },
        hooks: {
          afterConnect(connection) {
            connection.configure('busyTimeout', 5000);
          },
        },
      });

      this.#models.set('Setting', sequelize.define('Setting', Setting));
      this.#models.set('App', sequelize.define('App', App));
      this.#models.set('Certificate', sequelize.define('Certificate', Certificate));
      this.#models.set('Proxy', sequelize.define('Proxy', Proxy));

      await sequelize.sync({
        alter: true,
      });
      return sequelize;
    });

    this.sequelize
      .then(() => this.debug('Ready'))
      .catch(err => {
        this.debug(err);
        process.exit(1);
      });
  }

  async getModel(modelName) {
    await this.sequelize;
    return this.#models.get(modelName);
  }

  async getModelSetting() {
    return this.getModel('Setting');
  }

  async getModelApp() {
    return this.getModel('App');
  }

  async getModelCertificate() {
    return this.getModel('Certificate');
  }

  async getModelProxy() {
    return this.getModel('Proxy');
  }

}
