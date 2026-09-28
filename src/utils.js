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
  // eslint-disable-next-line no-console
  console.warn('mini-graph-card-xt: ', message);
};

export {
  getMin, getAvg, getMax, getMinMaxNumber,
  getTime, getMilli, getTimestamp, compress, decompress, log,
  getFirstDefinedItem, getFirstNumber,
  fastHash, compareArray,
};
