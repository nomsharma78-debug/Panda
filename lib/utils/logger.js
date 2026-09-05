/**
 * Structured, environment-aware logger for Panda
 * Provides categorized namespacing, log levels, and ISO timestamps.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

const currentLevel = (() => {
  if (process.env.NODE_ENV === 'test') return LOG_LEVELS.WARN;
  if (process.env.LOG_LEVEL) {
    const lvl = process.env.LOG_LEVEL.toUpperCase();
    if (lvl in LOG_LEVELS) return LOG_LEVELS[lvl];
  }
  return process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;
})();

function formatMessage(namespace, message) {
  const ts = new Date().toISOString();
  return `[${ts}] [${namespace}] ${message}`;
}

class Logger {
  constructor(namespace = 'Panda') {
    this.namespace = namespace;
  }

  child(subNamespace) {
    return new Logger(`${this.namespace}:${subNamespace}`);
  }

  debug(message, ...args) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage(this.namespace, message), ...args);
    }
  }

  info(message, ...args) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.info(formatMessage(this.namespace, message), ...args);
    }
  }

  warn(message, ...args) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatMessage(this.namespace, message), ...args);
    }
  }

  error(message, ...args) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatMessage(this.namespace, message), ...args);
    }
  }
}

export const logger = new Logger('Panda');
export default logger;
