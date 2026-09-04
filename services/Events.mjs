import Events from '../lib/Events.mjs';
import SQLite from './SQLite.mjs';
import { CONTAINARR_VERSION } from '../config.mjs';

export default new Events({ sqlite: SQLite, version: CONTAINARR_VERSION });
