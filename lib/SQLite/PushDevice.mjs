import { DataTypes } from '@sequelize/core';

export default {
  id: { type: DataTypes.STRING, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
  subscription: { type: DataTypes.JSON, allowNull: false },
  lastSentAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.TEXT, allowNull: true },
};
