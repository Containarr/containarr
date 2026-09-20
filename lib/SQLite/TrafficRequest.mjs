import { DataTypes } from '@sequelize/core';

export default {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  method: { type: DataTypes.STRING, allowNull: false },
  host: { type: DataTypes.STRING, allowNull: false },
  path: { type: DataTypes.TEXT, allowNull: false },
  clientIp: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.INTEGER, allowNull: false },
  durationMs: { type: DataTypes.DOUBLE, allowNull: false },
  bytes: { type: DataTypes.DOUBLE, allowNull: false },
};
