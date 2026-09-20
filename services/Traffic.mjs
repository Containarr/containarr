import Traffic from '../lib/Traffic.mjs';
import SQLite from './SQLite.mjs';

export default new Traffic({ sqlite: SQLite });
