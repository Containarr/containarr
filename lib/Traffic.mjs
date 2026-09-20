import debug from 'debug';

export default class Traffic {
  debug = debug('Traffic');
  pending = new Map();
  sequence = 0;
  generation = 0;
  operation = Promise.resolve();
  flushing = false;

  constructor({ sqlite }) {
    this.sqlite = sqlite;
    this.ready = sqlite.getModel('TrafficRequest').then(model => { this.Request = model; });
    this.ready.catch(error => this.debug(error));
    this.flushInterval = setInterval(() => {
      this.flush().catch(error => this.debug('Could not save traffic logs:', error));
    }, 1000);
    this.flushInterval.unref();
  }

  record(line) {
    let entry;
    try { entry = JSON.parse(line); } catch { return false; }
    if (!entry || typeof entry.RequestMethod !== 'string' || typeof entry.RequestPath !== 'string'
      || typeof entry.StartUTC !== 'string' || !Number.isFinite(Date.parse(entry.StartUTC))
      || !Number.isInteger(entry.DownstreamStatus) || entry.DownstreamStatus < 0 || entry.DownstreamStatus > 599) return false;

    // Treat UI API calls as handled so they are not stored or echoed to debug logs.
    if (entry.ServiceName === 'containarr@http'
      && /^\/api(?:\/|[?#]|$)/.test(entry.RequestPath)
      && entry['request_X-Containarr-Client'] === 'web-ui') return true;

    // Only retain request metadata, never headers, credentials, or query parameters.
    this.pending.set(++this.sequence, {
      startedAt: new Date(entry.StartUTC),
      method: entry.RequestMethod.slice(0, 32),
      host: typeof entry.RequestHost === 'string' ? entry.RequestHost.slice(0, 255) : '',
      path: entry.RequestPath.split(/[?#]/, 1)[0].slice(0, 8192),
      clientIp: typeof entry.ClientHost === 'string' ? entry.ClientHost.slice(0, 255) : '',
      status: entry.DownstreamStatus,
      durationMs: Number.isFinite(entry.Duration) && entry.Duration >= 0 ? entry.Duration / 1_000_000 : 0,
      bytes: Number.isFinite(entry.DownstreamContentSize) && entry.DownstreamContentSize >= 0 ? entry.DownstreamContentSize : 0,
    });
    if (this.pending.size > 100_000) this.pending.delete(this.pending.keys().next().value);
    return true;
  }

  flush() {
    if (this.flushing || this.pending.size === 0) return this.operation;
    const batch = [...this.pending];
    this.pending.clear();
    const generation = this.generation;
    this.flushing = true;
    this.operation = this.operation.catch(() => {}).then(async () => {
      await this.ready;
      const sequelize = await this.sqlite.sequelize;
      await sequelize.transaction(async transaction => {
        for (let offset = 0; offset < batch.length; offset += 500) {
          await this.Request.bulkCreate(batch.slice(offset, offset + 500).map(([, entry]) => entry), { transaction });
        }
        // Insertion order represents completed requests, including long-running requests.
        await sequelize.query('DELETE FROM "TrafficRequests" WHERE "id" <= (SELECT "id" FROM "TrafficRequests" ORDER BY "id" DESC LIMIT 1 OFFSET 100000)', { transaction });
      });
    }).catch(error => {
      if (generation === this.generation) {
        this.pending = new Map([...batch, ...this.pending].slice(-100_000));
      }
      throw error;
    }).finally(() => { this.flushing = false; });
    return this.operation;
  }

  async list({ page = 1 } = {}) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 2000) {
      throw Object.assign(new Error('Invalid page.'), { statusCode: 400 });
    }
    await this.flush();
    await this.ready;
    const sequelize = await this.sqlite.sequelize;
    return sequelize.transaction(async transaction => {
      const { count, rows } = await this.Request.findAndCountAll({
        order: [['id', 'DESC']], limit: 50, offset: (page - 1) * 50, transaction,
      });
      return { requests: rows, total: count, page, pageSize: 50 };
    });
  }

  clear() {
    this.generation += 1;
    this.pending.clear();
    // Serialize with any in-flight write so cleared entries cannot reappear.
    this.operation = this.operation.catch(() => {}).then(async () => {
      await this.ready;
      await this.Request.destroy({ where: {} });
    });
    return this.operation;
  }
}
