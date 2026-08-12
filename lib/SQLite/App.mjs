import { DataTypes } from '@sequelize/core';

export default {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  subdomain: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  port: {
    type: DataTypes.INTEGER,
    min: 1,
    max: 65535,
    allowNull: true,
  },
  tls: {
    type: DataTypes.ENUM([
      'only_https',
      'only_http',
      'both_http_and_https',
      'redirect_http_to_https',
    ]),
    defaultValue: 'only_https',
    allowNull: false,
  },
  dockerImage: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  dockerVolumes: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  dockerPorts: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  dockerEnvironment: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
};