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

/**
 * Returns just the 'none' value for solid and stroke linecap for SVG.
 *
 * @returns {{lineStyle: string, strokeLinecap: string}}
 *   Object containing the dasharray and linecap.
 */
const getSolidPattern = () => ({ lineStyle: 'none', strokeLinecap: 'butt' });

/**
 * Calculates a symmetrical dotted pattern for SVG stroke-dasharray.
 * Uses a microscopic dash length to force subpixel rendering precision in the browser,
 * eliminating trailing gaps for ANY line_width. Designed for stroke-linecap="round".
 *
 * @param {number} lineWidth - The thickness of the line in pixels.
 * @param {number} width - The total length/width of the SVG path or line.
 * @returns {{lineStyle: string, strokeLinecap: string}}
 *   Object containing the dasharray and linecap.
 */
const getDotPattern = (lineWidth, width) => {
  // A tiny length makes the browser render with absolute subpixel precision,
  // while still forming a perfect circle due to stroke-linecap="round".
  const dotLength = 0.001;

  // Calculate how many gaps fit into the width using a golden-ratio spacing of 2.5
  const gapCount = Math.floor(width / (2.5 * lineWidth));

  // Distribute the remaining pixel remainder evenly across all gaps
  const exactGap = (width - (gapCount + 1) * dotLength) / gapCount;

  // Return a clean configuration object perfect for Lit templates
  return {
    lineStyle: `${dotLength} ${exactGap}`,
    strokeLinecap: 'round',
  };
};

/**
 * Calculates a symmetrical dashed pattern string for SVG stroke-dasharray.
 * Ensures the line starts and ends with a full, complete dash at the exact boundaries.
 * Designed for stroke-linecap="butt".
 *
 * @param {number} lineWidth - The thickness of the line in pixels.
 * @param {number} width - The total length/width of the SVG path or line.
 * @returns {{lineStyle: string, strokeLinecap: string}}
 *    Object containing the dasharray and linecap.
 */
const getDashPattern = (lineWidth, width) => {
  const dashLength = lineWidth * 3; // Dash length is 3 times the thickness
  const minGap = dashLength; // Gap is at least as long as the dash

  // Symmetrical dashed lines always have exactly one more dash than gaps
  const gapCount = Math.floor((width - dashLength) / (dashLength + minGap));
  const exactGap = (width - (gapCount + 1) * dashLength) / gapCount;

  return {
    lineStyle: `${dashLength} ${exactGap}`,
    strokeLinecap: 'butt',
  };
};

/**
 * Calculates a symmetrical dash-dot (dash, gap, dot, gap) pattern string.
 * Ensures that the pattern starts with a full dash on the left boundary and
 * ends with a full dash on the right boundary and where the "dot" is rendered as a
 * precise square (length equals thickness)
 *
 * @param {number} lineWidth - The thickness of the line in pixels.
 * @param {number} width - The total length/width of the SVG path or line.
 * @returns {{lineStyle: string, strokeLinecap: string}}
 *    Object containing the dasharray and linecap.
 */
const getDashDotPattern = (lineWidth, width) => {
  const dashLength = lineWidth * 3; // Dash length is 3 times the thickness
  const dotLength = lineWidth; // A square dash (length = thickness) acts as the "dot"
  const baseGap = lineWidth * 2.5; // Visual gap spacing based on line thickness

  // One full period consists of: [Dash, Gap, Dot, Gap]
  // To end with a Dash on the right edge, the total line length must fit:
  // (N * PeriodLength) + DashLength
  const periodLength = dashLength + baseGap + dotLength + baseGap;
  const periodCount = Math.floor((width - dashLength) / periodLength);

  // Distribute the remaining pixel remainder evenly across all gaps in the pattern
  const totalGapsCount = periodCount * 2;
  const usedPatternWidth = (periodCount * (dashLength + dotLength)) + dashLength;
  const exactGap = (width - usedPatternWidth) / totalGapsCount;

  return {
    lineStyle: `${dashLength} ${exactGap} ${dotLength} ${exactGap}`,
    strokeLinecap: 'butt',
  };
};

/**
 * A registry tracking the available SVG line style generation strategies.
 * Maps style identifiers to their corresponding pattern calculator functions.
 *
 * Each mapped function expects `(lineWidth: number, width: number)` as arguments
 * and returns a standard configuration object containing the CSS properties.
 *
 * @type {Object.<string, function(number, number): {line_style: string, line_cap: string}>}
 * @property {function} solid - Generates a continuous solid line configuration.
 * @property {function} dotted - Generates a pixel-perfect, subpixel-precise circular dot pattern.
 * @property {function} dashed - Generates a crisp, flat-edged dash pattern with a 3:1 ratio.
 * @property {function} dashdot - Generates an alternating round dash-and-dot reference pattern.
 */
const lineStylesBase = {
  solid: getSolidPattern,
  dotted: getDotPattern,
  dashed: getDashPattern,
  dashdot: getDashDotPattern,
};

/**
 * A dynamic Proxy wrapper around `lineStylesBase` acting as a fallback mechanism.
 *
 * If a known style preset (e.g., 'dotted', 'dashed') is requested, it delegates
 * the call to the respective calculator function.
 * If an unknown string or raw numeric pattern (e.g., '5 10 2 10') is passed from
 * the YAML config, it acts as a passthrough, returning the raw string directly
 * as the `dasharray` with default 'butt' linecaps.
 *
 * @type {Proxy.<typeof lineStylesBase>}
 */
const lineStyles = new Proxy(lineStylesBase, {
  /**
   * Intercepts property access on the line styles registry.
   *
   * @param {typeof lineStylesBase} target - The base line styles mapping object.
   * @param {string} prop - The requested style name or raw dasharray string from config.
   * @returns {function(number, number): {line_style: string, line_cap: string, l?: number
   * , w?: number} | function(number, number): {dasharray: string, lineCap: string, l: number,
   * w: number}}
   *          A function that calculates or passes through the layout configuration.
   */
  get(target, prop) {
    return prop in target
      ? target[prop]
      : (l, w) => (
        {
          lineStyle: prop,
          strokeLinecap: 'butt',
          l,
          w,
        }
      );
  },
});

const ensureObjectPath = (obj, pathArray) => {
  let current = obj;

  for (let i = 0; i < pathArray.length; i += 1) {
    const key = pathArray[i];

    // Re-create the property if it's missing or not an object
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  // Returns the deepest nested (and now guaranteed) object
  return current;
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
    if (!isValid && type === 'number') {
      const numConf = options.number || {};
      // eslint-disable-next-line object-curly-newline
      const { min = -Infinity, gt = -Infinity, max = Infinity, lt = Infinity } = numConf;
      const { cleaned } = cleanNumber(val, numConf || {});
      if (cleaned < min || cleaned <= gt || cleaned > max || cleaned >= lt) {
        throw new Error('[Configuration Error]'
          + `${index === 0 && options.contextName ? ` (${options.contextName})` : options.parentLevelName ? ` (${options.parentLevelName})` : ''}
          Contradictory bounds detected, check value for '${item}': ${cleaned}`);
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
  fastHash, compareArray, log, lineStyles,
  ensureObjectPath, normalizeItem,
};
