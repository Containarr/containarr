import debug from 'debug';
import { Sequelize, DataTypes } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';

import Setting from './SQLite/Setting.mjs';
import App from './SQLite/App.mjs';

export default class SQLite {

  debug = debug('SQLite');

  #models = new Map();

  constructor() {
    this.sequelize = Promise.resolve().then(async () => {
      const sequelize = new Sequelize({
        dialect: SqliteDialect,
        storage: '/data/sqlite/db.sqlite',
      });

      this.#models.set('Setting', sequelize.define('Setting', Setting));
      this.#models.set('App', sequelize.define('App', App));

      await sequelize.sync();
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

}