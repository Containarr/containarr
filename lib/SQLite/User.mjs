import { DataTypes } from '@sequelize/core';

export default {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9][a-z0-9._-]{2,63}$/,
    },
  },
  passwordHash: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
};
