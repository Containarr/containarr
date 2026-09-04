import { DataTypes } from '@sequelize/core';

export default {
  appId: { type: DataTypes.STRING, primaryKey: true },
  offlineSince: { type: DataTypes.DATE, allowNull: true },
  notified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
};
