import { DataTypes } from '@sequelize/core';

export default {
  id: {
    type: DataTypes.STRING(64),
    primaryKey: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
};
