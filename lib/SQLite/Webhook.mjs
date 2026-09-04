import { DataTypes } from '@sequelize/core';

export default {
  id: { type: DataTypes.STRING, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.TEXT, allowNull: false },
  lastSentAt: { type: DataTypes.DATE, allowNull: true },
  lastError: { type: DataTypes.TEXT, allowNull: true },
};
