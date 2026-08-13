import { DataTypes } from '@sequelize/core';

export default {
  hostname: {
    type: DataTypes.STRING,
    primaryKey: true,
    validate: {
      is: /^[a-z0-9.-]+$/,
    },
  },
  status: {
    type: DataTypes.ENUM([
      'provisioning',
      'renewing',
      'ready',
      'error',
    ]),
    allowNull: false,
    defaultValue: 'provisioning',
  },
  certificate: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  privateKey: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  directoryUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  retryAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
};
