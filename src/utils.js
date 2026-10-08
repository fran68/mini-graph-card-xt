/* eslint-disable no-bitwise */
import { compress as lzStringCompress, decompress as lzStringDecompress } from '@kalkih/lz-string';

const getMin = (arr, val) => arr.reduce((min, p) => (
  Number(p[val]) < Number(min[val]) ? p : min
), arr[0]);
const getAvg = (arr, val) => arr.reduce((sum, p) => (
  sum + Number(p[val])
), 0) / arr.length;
const getMax = (arr, val) => arr.reduce((max, p) => (
  Number(p[val]) > Number(max[val]) ? p : max
), arr[0]);
const getMinMaxNumber = (arr_obj, opt, glob) => {
  if (arr_obj.length === 0) return { min: glob, max: glob };
  const values = arr_obj.map((item) => {
    const val = item[opt];
    return (typeof val === 'number' && !Number.isNaN(val)) ? val : glob;
  });
  return { min: Math.min(...values), max: Math.max(...values) };
};
const getTime = (date, extra, locale = 'en-US') => date.toLocaleString(locale, { hour: 'numeric', minute: 'numeric', ...extra });
const getMilli = hours => hours * 60 ** 2 * 10 ** 3;
const getTimestamp = t => t.getTime() - t.getTimezoneOffset() * 60 * 10 ** 3;

const compress = data => lzStringCompress(JSON.stringify(data));

const decompress = data => (typeof data === 'string' ? JSON.parse(lzStringDecompress(data)) : data);

const getFirstDefinedItem = (...collection) => collection.find(item => typeof item !== 'undefined');
const getFirstNumber = (...collection) => collection.find(item => typeof item === 'number');

const fastHash = (str) => {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i += 1) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

// eslint-disable-next-line max-len
const compareArray = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

const log = (message) => {
  const isFailure = message.includes('Failure');

  // %c tells JavaScript to apply CSS styling
  const prefix = isFailure ? '%c[mini-graph-card-xt][ERROR]' : '%c[mini-graph-card-xt][WARN]';
  const colorStyle = isFailure
    ? 'color: #ff3333; font-weight: normal; text-transform: uppercase;'
    : 'color: #ffaa00; font-weight: normal;';

  // eslint-disable-next-line no-console
  console.warn(prefix, colorStyle, message);
};

const isValidNumber = (val, numberConfig) => {
  if (typeof val !== 'number' || Number.isNaN(val)) return false;

  if (numberConfig.min !== undefined && val < numberConfig.min) return false;
  if (numberConfig.gt !== undefined && val <= numberConfig.gt) return false;
  if (numberConfig.max !== undefined && val > numberConfig.max) return false;
  if (numberConfig.lt !== undefined && val >= numberConfig.lt) return false;

  return true;
};

const cleanNumber = (val, numberConfig) => {
  let cleaned = val;
  let isSoftBound = false;

  if (typeof val === 'string' && val.trim() !== '') {
    const cleanedStr = val.trim();
    // Check for Softbound syntax (starts with '~')
    if (numberConfig.allowedPrefixes
         && numberConfig.allowedPrefixes.some(prefix => cleanedStr.startsWith(prefix))) {
      const possibleNum = cleanedStr.slice(1).trim();
      const parsed = Number(possibleNum);

      if (possibleNum !== '' && !Number.isNaN(parsed)) {
        cleaned = parsed;
        isSoftBound = true;
      }
    } else {
      const parsed = Number(cleanedStr);
      if (!Number.isNaN(parsed)) {
        cleaned = parsed;
      }
    }
  }

  return { cleaned, isSoftBound };
};

const isValidString = (val, stringConfig) => {
  if (typeof val !== 'string') return false;

  if (stringConfig.regex instanceof RegExp && !stringConfig.regex.test(val)) return false;
  return true;
};

const cleanString = (val, stringConfig) => {
  let cleaned = val;

  if (typeof val !== 'string') return val;

  const cleanedStr = val.trim();
  if (stringConfig.replace instanceof RegExp) {
    const replaceWith = stringConfig.replaceWith !== undefined ? stringConfig.replaceWith : ' ';
    cleaned = cleanedStr.replace(stringConfig.replace, replaceWith).trim();
  }
  return cleaned;
};

const isValidArray = (arr, arrayConfig) => {
  if (!Array.isArray(arr)) return false;

  if (arrayConfig.minItemCount !== undefined && arr.length < arrayConfig.minItemCount) {
    return false;
  }

  if (arrayConfig.validateItems && typeof arrayConfig.validateItems === 'function') {
    return arr.every(item => arrayConfig.validateItems(item));
  }
  return true;
};

/**
 * Safely validates and cascades configuration items from YAML.
 * Supports type checking, auto-parsing, and boundary enforcement.
 */
const normalizeItem = (
  config, // e.g. conf, conf.entities[i], conf.y_axes.primary.bounds
  item, // e.g. font_size, line_width/graph, lower
  type,
  defaultVal,
  options = {},
) => {
  const confVal = config ? config[item] : undefined;
  const parentConfig = options.parentConfig || undefined; // e.g. undefined, conf, conf.show
  const parentItem = options.parentItem || item;

  const globalVal = (parentConfig && parentConfig[parentItem] !== undefined)
    ? parentConfig[parentItem]
    : undefined; // e.g. conf.line_width, conf.show.graph

  const allowedStr = Array.isArray(options.stringArr) ? options.stringArr : [];
  const debug = options.debug || false;
  let check_type = type;
  let log_message = '';

  let cleanedNum = null;
  let cleanedStr = null;

  const matchedVal = [confVal, globalVal].find((val, index) => {
    // If undefined (no user input), silently skip to the next level without error.
    if (val === undefined || val === null) return false;

    // Check if value is explicitly allowed as an exception string
    let isValid = allowedStr.includes(val);
    if (!isValid && debug && allowedStr.length > 0)
      check_type = type === undefined ? 'string' : `stringArray/${type}`;

    if (!isValid) {
      if (type === 'number') {
        const numConf = options.number || {};
        const { cleaned, isSoftBound } = cleanNumber(val, numConf);
        if (isValidNumber(cleaned, numConf)) {
          cleanedNum = isSoftBound ? `~${cleaned}` : cleaned;
          isValid = true;
        }
      } else if (type === 'string') {
        const strConf = options.string || {};
        const cleaned = cleanString(val, strConf);
        if (isValidString(cleaned, strConf)) {
          cleanedStr = cleaned;
          isValid = true;
        }
      } else if (type === 'boolean') {
        isValid = typeof val === 'boolean';
      } else if (type === 'array') {
        isValid = isValidArray(val, options.array || {}, options);
      }
    }

    // Boundary violation error (only throw at global level)
    if (!isValid && index === 1 && type === 'number') {
      const numConf = options.number || {};
      // eslint-disable-next-line object-curly-newline
      const { min = -Infinity, gt = -Infinity, max = Infinity, lt = Infinity } = numConf;
      const { cleaned } = cleanNumber(val, numConf || {});
      if (cleaned < min || cleaned <= gt || cleaned > max || cleaned >= lt) {
        throw new Error(`[Configuration Error]${options.name ? ` [${options.name}]` : ''} Contradictory bounds detected`);
      }
    }

    // Slim lazy logging: Fires ONLY if the value exists but is invalid
    if (!isValid && debug) {
      const { contextName, parentLevelName } = options;
      const currentLevel = index === 0
        ? (contextName ? 'Section Level' : 'Global Level')
        : (parentLevelName ? `Section Level (${parentLevelName})` : 'Global Level');
      const nextTarget = index === 0 && globalVal !== undefined
        ? (parentLevelName ? `Section Level (${parentLevelName})` : 'Global Level')
        : 'Default Value';
      const nextVal = index === 0 && globalVal !== undefined
        ? globalVal
        : defaultVal;

      const context = contextName ? `[${contextName}]` : '';
      log_message += !log_message && context ? `\n${context}` : '';
      log_message += `\nInvalid '${check_type}' on ${currentLevel} for '${item}': ${JSON.stringify(val)}.`
        + `\nFalling back to ${nextTarget}: ${JSON.stringify(nextVal)}.`;
    }
    return isValid;
  });

  if (log_message && debug) {
    const time_options = { hour: 'numeric', minute: 'numeric', fractionalSecondDigits: 3 };
    // eslint-disable-next-line object-curly-newline
    log(`[${new Date().toLocaleTimeString(undefined, time_options)}] [Validation Failed]`
      + `${log_message}`);
  }

  if (matchedVal !== undefined) {
    // Return the cleaned result if it was a valid string
    if (type === 'number' && cleanedNum !== null) return cleanedNum;
    if (type === 'string' && cleanedStr !== null) return cleanedStr;
    return matchedVal;
  }

  return defaultVal;
};

export {
  getMin, getAvg, getMax, getMinMaxNumber,
  getTime, getMilli, getTimestamp, compress, decompress,
  getFirstDefinedItem, getFirstNumber,
  fastHash, compareArray, log, normalizeItem,
};
