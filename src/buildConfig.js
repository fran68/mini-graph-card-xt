import {
  normalizeItem,
} from './utils';
import {
  URL_DOCS,
  FONT_SIZE,
  FONT_SIZE_HEADER,
  DEFAULT_LINE_WIDTH,
  DEFAULT_LINE_STYLE,
  DEFAULT_BASELINE,
  DEFAULT_BAR_SPACING,
  DEFAULT_BAR_ANIMATE_HORIZONTAL,
  DEFAULT_COLORS,
  DEFAULT_SHOW,
} from './const';

/**
 * Starting from the given index, increment the index until an array element with a
 * "value" property is found
 *
 * @param {Array} stops
 * @param {number} startIndex
 * @returns {number}
 */
const findFirstValuedIndex = (stops, startIndex) => {
  for (let i = startIndex, l = stops.length; i < l; i += 1) {
    if (stops[i].value != null) {
      return i;
    }
  }
  throw new Error(
    'Error in threshold interpolation: could not find right-nearest valued stop. '
    + 'Do the first and last thresholds have a set "value"?',
  );
};

/**
 * Interpolates the "value" of each stop. Each stop can be a color string or an object of type
 * ```
 * {
 *   color: string
 *   value?: number | null
 * }
 * ```
 * And the values will be interpolated by the nearest valued stops.
 *
 * For example, given values `[ 0, null, null, 4, null, 3]`,
 * the interpolation will output `[ 0, 1.3333, 2.6667, 4, 3.5, 3 ]`
 *
 * Note that values will be interpolated ascending and descending.
 * All that's necessary is that the first and the last elements have values.
 *
 * @param {Array} stops
 * @returns {Array<{ color: string, value: number }>}
 */
const interpolateStops = (stops) => {
  if (!stops || !stops.length) {
    return stops;
  }
  if (stops[0].value == null || stops[stops.length - 1].value == null) {
    throw new Error(`The first and last thresholds must have a set "value".\n See ${URL_DOCS}`);
  }

  let leftValuedIndex = 0;
  let rightValuedIndex = null;

  return stops.map((stop, stopIndex) => {
    if (stop.value != null) {
      leftValuedIndex = stopIndex;
      return { ...stop };
    }

    if (rightValuedIndex == null) {
      rightValuedIndex = findFirstValuedIndex(stops, stopIndex);
    } else if (stopIndex > rightValuedIndex) {
      leftValuedIndex = rightValuedIndex;
      rightValuedIndex = findFirstValuedIndex(stops, stopIndex);
    }

    // y = mx + b
    // m = dY/dX
    // x = index in question
    // b = left value

    const leftValue = stops[leftValuedIndex].value;
    const rightValue = stops[rightValuedIndex].value;
    const m = (rightValue - leftValue) / (rightValuedIndex - leftValuedIndex);
    return {
      color: typeof stop === 'string' ? stop : stop.color,
      value: m * stopIndex + leftValue,
    };
  });
};

const computeThresholds = (stops, type) => {
  const valuedStops = interpolateStops(stops);
  valuedStops.sort((a, b) => b.value - a.value);

  if (type === 'smooth') {
    return valuedStops;
  } else {
    const rect = [].concat(...valuedStops.map((stop, i) => ([stop, {
      value: stop.value - 0.0001,
      color: valuedStops[i + 1] ? valuedStops[i + 1].color : stop.color,
    }])));
    return rect;
  }
};

// Wrapper
/* eslint-disable implicit-arrow-linebreak */
const createNormalizer = (config, parentConfig, contextName, parentLevelName = '', debug) =>
  (item, type, defaultVal, specificOptions = {}) =>
    normalizeItem(config, item, type, defaultVal, {
      parentConfig,
      debug,
      contextName,
      parentLevelName,
      ...specificOptions,
    });
/* eslint-enable implicit-arrow-linebreak */

export default (config) => {
  if (!Array.isArray(config.entities))
    throw new Error(`Please provide the "entities" option as a list.\n See ${URL_DOCS}`);
  if (config.line_color_above || config.line_color_below)
    throw new Error(
      `"line_color_above/line_color_below" was removed, please use "color_thresholds".\n See ${URL_DOCS}`,
    );

  const cleanConfig = JSON.parse(JSON.stringify(config));

  const conf = {
    animate: false,
    hour24: false,
    font_size: FONT_SIZE,
    font_size_header: FONT_SIZE_HEADER,
    height: 100,
    hours_to_show: 24,
    points_per_hour: 0.5,
    x_scale: 10,
    x_major_breaks: 4,
    aggregate_func: 'avg',
    group_by: 'interval',
    line_color: [...DEFAULT_COLORS],
    color_thresholds: [],
    color_thresholds_transition: 'smooth',
    bar_spacing_group: 0,
    bar_animate_horizontal: DEFAULT_BAR_ANIMATE_HORIZONTAL,
    compress: true,
    smoothing: true,
    state_map: [],
    cache: true,
    value_factor: 0,
    tap_action: {
      action: 'more-info',
    },
    ...cleanConfig,
    show: { ...DEFAULT_SHOW, ...cleanConfig.show },
  };

  const lineStyleRegex = /^(none|\d+(\.\d+)?([\s,]+\d+(\.\d+)?)*)$/;
  conf.debug = normalizeItem(conf, 'debug', 'boolean', false);

  conf.entities = conf.entities.map((entity, index) => {
    const entityConf = typeof entity === 'string' ? { entity } : { ...entity };

    entityConf.index = index;

    if (typeof entityConf.static_value === 'number') {
      // Fallback generation if YAML contains no real entity ID
      if (!entityConf.entity)
        entityConf.entity = `sensor.virtual_static_value_${entityConf.static_value}_${index}`;
    }

    let contextName;
    if (conf.debug) {
      const logName = entityConf.name || entityConf.entity;
      contextName = `Entity (${index + 1}) '${logName}'`;
    }

    // Initialize the normalize functions
    const normalizeEntity = createNormalizer(entityConf, conf, contextName, '', conf.debug);
    const normalizeEntityShow = createNormalizer(entityConf, conf.show, contextName, 'show', conf.debug);

    // Normalize specific configuration options against options at global or other level
    // and set option unconditionally as an entity option
    entityConf.set_graph = normalizeEntityShow('graph', undefined, DEFAULT_SHOW.graph, { stringArr: ['line', 'bar'] });
    entityConf.set_y_axis = normalizeEntity('y_axis', undefined, 'primary', { stringArr: ['primary', 'secondary'], parentConfig: '' });
    entityConf.set_line_width = normalizeEntity('line_width', 'number', DEFAULT_LINE_WIDTH, { number: { min: 0 } });
    entityConf.set_bar_spacing = normalizeEntity('bar_spacing', 'number', DEFAULT_BAR_SPACING, { number: { min: 0 } });
    entityConf.set_line_style = normalizeEntity('line_style', 'string', DEFAULT_LINE_STYLE,
      {
        stringArr: ['solid', 'dotted', 'dashed', 'dashdot'],
        string: {
          regex: lineStyleRegex,
        },
      });
    entityConf.set_baseline = normalizeEntity('baseline', 'number', DEFAULT_BASELINE, { stringArr: ['top', 'bottom'] });

    return entityConf;
  });

  if (typeof cleanConfig.line_color === 'string')
    conf.line_color = [cleanConfig.line_color, ...DEFAULT_COLORS];

  conf.font_size = (cleanConfig.font_size / 100) * FONT_SIZE || FONT_SIZE;

  conf.color_thresholds = computeThresholds(
    conf.color_thresholds,
    conf.color_thresholds_transition,
  );
  const additional = conf.hours_to_show > 24 ? { day: 'numeric', weekday: 'short' } : {};
  const hourFormat = conf.hour24 ? { hourCycle: 'h23' } : { hour12: true };
  conf.format = { ...hourFormat, ...additional };

  // override points per hour to mach group_by function
  switch (conf.group_by) {
    case 'date':
      conf.points_per_hour = 1 / 24;
      break;
    case 'hour':
      conf.points_per_hour = 1;
      break;
    default:
      break;
  }

  // Add one data point to cover the complete hours to show (line graph)
  conf.hours_to_show += 1 / conf.points_per_hour;

  return conf;
};
