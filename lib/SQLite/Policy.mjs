import net from 'node:net';
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
    unique: true,
  },
  allowedIps: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    validate: {
      validate(value) {
        if (!Array.isArray(value)) {
          throw new Error('allowedIps must be an array');
        }

        for (const entry of value) {
          if (typeof entry !== 'string') {
            throw new Error('Allowed IPs must be strings');
          }

          const [address, prefix, extra] = entry.split('/');
          const family = net.isIP(address);
          if (!family || extra !== undefined) {
            throw new Error(`Invalid IP address or CIDR: ${entry}`);
          }
          if (prefix !== undefined) {
            const bits = Number(prefix);
            if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) {
              throw new Error(`Invalid IP address or CIDR: ${entry}`);
            }
          }
        }
      },
    },
  },
};
