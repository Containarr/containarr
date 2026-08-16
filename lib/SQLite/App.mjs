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
    unique: true,
    validate: {
      is: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
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
  logo: {
    type: DataTypes.BLOB,
    allowNull: true,
  },
  registryId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  registryVersion: {
    type: DataTypes.INTEGER,
    allowNull: true,
    min: 1,
  },
  dockerImage: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  autoUpdate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  policyId: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'public',
  },
  dockerNetworkMode: {
    type: DataTypes.ENUM([
      'bridge',
      'host',
    ]),
    allowNull: false,
    defaultValue: 'bridge',
  },
  dockerVolumes: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  dockerDevices: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
  },
  dockerPorts: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    validate: {
      validate(value) {
        if (!Array.isArray(value)) {
          throw new Error('dockerPorts must be an array');
        }

        for (const port of value) {
          if (typeof port !== 'object' || port === null) {
            throw new Error('dockerPorts must be an array of objects');
          }

          if (typeof port.container !== 'number') {
            throw new Error('Missing dockerPorts.container');
          }

          if (typeof port.host !== 'number') {
            throw new Error('Missing dockerPorts.host');
          }

          if (!['tcp', 'udp'].includes(port.protocol)) {
            throw new Error('Invalid dockerPorts.protocol');
          }
        };
      },
    },
  },
  dockerEnvironment: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
  },
  dockerUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
    },
  },
  dockerGroupId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
    },
  },
  dockerAutoStart: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  dockerPrivileged: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  dockerCapabilities: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    validate: {
      validate(value) {
        if (!Array.isArray(value)) {
          throw new Error('dockerCapabilities must be an array');
        }

        for (const capability of value) {
          if (typeof capability !== 'string') {
            throw new Error('dockerCapabilities must be an array of strings');
          }

          if (![
            'CAP_AUDIT_CONTROL',
            'CAP_AUDIT_READ',
            'CAP_AUDIT_WRITE',
            'CAP_BLOCK_SUSPEND',
            'CAP_BPF',
            'CAP_CHECKPOINT_RESTORE',
            'CAP_CHOWN',
            'CAP_DAC_OVERRIDE',
            'CAP_DAC_READ_SEARCH',
            'CAP_FOWNER',
            'CAP_FSETID',
            'CAP_IPC_LOCK',
            'CAP_IPC_OWNER',
            'CAP_KILL',
            'CAP_LEASE',
            'CAP_LINUX_IMMUTABLE',
            'CAP_MAC_ADMIN',
            'CAP_MAC_OVERRIDE',
            'CAP_MKNOD',
            'CAP_NET_ADMIN',
            'CAP_NET_BIND_SERVICE',
            'CAP_NET_BROADCAST',
            'CAP_NET_RAW',
            'CAP_PERFMON',
            'CAP_SETFCAP',
            'CAP_SETGID',
            'CAP_SETPCAP',
            'CAP_SETUID',
            'CAP_SYS_ADMIN',
            'CAP_SYS_BOOT',
            'CAP_SYS_CHROOT',
            'CAP_SYS_MODULE',
            'CAP_SYS_NICE',
            'CAP_SYS_PACCT',
            'CAP_SYS_PTRACE',
            'CAP_SYS_RAWIO',
            'CAP_SYS_RESOURCE',
            'CAP_SYS_TIME',
            'CAP_SYS_TTY_CONFIG',
            'CAP_SYSLOG',
            'CAP_WAKE_ALARM',
          ].includes(capability)) {
            throw new Error(`Invalid capability: ${capability}`);
          }
        }
      },
    },
  },
};
