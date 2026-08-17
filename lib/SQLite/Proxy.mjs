import { DataTypes } from '@sequelize/core';

export default {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  subdomain: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      is: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
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
  sourceUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isHttpUrl(value) {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Source URL must use HTTP or HTTPS.');
        }
      },
    },
  },
  policyId: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'public',
  },
  disabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
};
