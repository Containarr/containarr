import { DataTypes } from '@sequelize/core';

export default {
  id: { type: DataTypes.STRING, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  eventName: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  appId: { type: DataTypes.STRING, allowNull: true },
  appName: { type: DataTypes.STRING, allowNull: true },
  details: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
};
