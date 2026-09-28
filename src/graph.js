import { interpolateRgb } from 'd3-interpolate';
import {
  X, Y, V,
  ONE_HOUR,
} from './const';

export default class Graph {
  constructor(
    width,
    height,
    margin,
    graph,
    hours = 24,
    points = 1,
    aggregateFuncName = 'avg',
    groupBy = 'interval',
    baseline = 0,
    smoothing = true,
    logarithmic = false,
    tension = 0.15,
    barTotalStacks,
    barStackPosition,
    bar_spacing,
    bar_spacing_group,
  ) {
    const aggregateFuncMap = {
      avg: this._average,
      median: this._median,
      max: this._maximum,
      min: this._minimum,
      first: this._first,
      last: this._last,
      sum: this._sum,
      delta: this._delta,
      diff: this._diff,
    };

    this._history = undefined;
    this.coords = [];
    this.width = width - margin[X] * 2;
    this.height = height - margin[Y] * 4;
    this.margin = margin;
    this._graph = graph;
    this._max = -Infinity;
    this._min = Infinity;
    this._lmax = null;
    this._lmin = null;
    this._yRatio = null;
    this._baseline = baseline;
    this._baselineCoordY = null;
    this._baselineRatio = null;
    this.points = points;
    this.hours = hours;
    this.aggregateFuncName = aggregateFuncName;
    this._calcPoint = aggregateFuncMap[aggregateFuncName] || this._average;
    this._smoothing = smoothing;
    this._logarithmic = logarithmic;
    this._groupBy = groupBy;
    this._endTime = 0;
    this._tension = tension;
    this._barTotalStacks = barTotalStacks;
    this._barStackPosition = barStackPosition; // undefined if show_graph = false
    this._barSpacing = bar_spacing;
    this._barSpacingGroup = bar_spacing_group;
    this._barWidth = null;
    this._barBaseExpression = null;
    this._barStepMultiplier = null;
    this._init();
  }

  _init() {
    if (this._graph === 'bar') {
      const total = this._barTotalStacks;
      const spacing = this._barSpacing;
      const spacing_group = this._barSpacingGroup;


      const shrink = spacing_group / total;
      const totalPoints = Math.ceil(this.hours * this.points - 1) || 1;
      const xRatio = (this.width / totalPoints) / total;
      this._barWidth = xRatio - (spacing + shrink);
      this._barBaseExpression = ((xRatio - shrink) * this._barStackPosition)
        + this.margin[X] + (spacing_group + spacing) / 2;
      this._barStepMultiplier = xRatio * total;
    }
  }

  get max() { return this._max; }

  set max(max) {
    if (this._max !== max) {
      this._max = max;
      this._lmax = this._logarithmic ? Math.log10(Math.max(1, max)) : max;
      this._updateYRatio();
    }
  }

  get min() { return this._min; }

  set min(min) {
    if (this._min !== min) {
      this._min = min;
      this._lmin = this._logarithmic ? Math.log10(Math.max(1, min)) : min;
      this._updateYRatio();
    }
  }

  _updateYRatio() {
    this._yRatio = ((this._lmax - this._lmin) / this.height) || 1;
    this._baselineCoordY = null;
    this._baselineRatio = null;
  }

  get baselineCoordY() {
    if (this._baselineCoordY === null) {
      let baseline = this._baseline;

      if (baseline === 'top') baseline = this.max;
      else if (baseline === 'bottom') baseline = this.min;
      else if (typeof baseline !== 'number') baseline = 0;

      // Positive values (including positive and zero values, or only zero values)
      if (baseline <= this.max && baseline <= this.min)
        // Absolute lower edge
        this._baselineCoordY = this.height + this.margin[Y] * 4;
      // Negative values (including negative and zero values)
      else if (baseline >= this.max)
        // Absolute upper edge
        this._baselineCoordY = 0;
      // Sign values (Positive and negative values)
      else {
        // _calcY calculates the exact position between (including logarithmization)
        const [[, calculatedY]] = this._calcY([[0, 0, baseline]]);
        this._baselineCoordY = calculatedY;
      }
    }
    return this._baselineCoordY;
  }

  get baselineRatio() {
    if (this._baselineRatio === null)
      this._baselineRatio = this.baselineCoordY / (this.height + this.margin[Y] * 4);

    return this._baselineRatio;
  }

  set history(data) { this._history = data; }

  update(history = undefined) {
    if (history) {
      this._history = history;
    }
    if (!this._history) return;
    this._updateEndTime();

    const histGroups = this._history.reduce((res, item) => this._reducer(res, item), []);

    // extend length to fill missing history
    const requiredNumOfPoints = Math.ceil(this.hours * this.points);
    histGroups.length = requiredNumOfPoints;

    const calculatedCoords = this._calcPoints(histGroups);
    if (calculatedCoords.length === 0) return;

    // Determine the starting array (bars skip the first pseudo-value)
    this.coords = this._graph === 'bar' ? calculatedCoords.slice(1) : calculatedCoords;
    if (this.coords.length === 0) return;

    // Determine min and max in a single pass
    let currentMin = Number(this.coords[0][V]);
    let currentMax = currentMin;

    const len = this.coords.length;
    for (let i = 1; i < len; i += 1) {
      const val = Number(this.coords[i][V]);
      if (val < currentMin) currentMin = val;
      if (val > currentMax) currentMax = val;
    }

    // Pass values to setters (triggers internal updates)
    this.min = currentMin;
    this.max = currentMax;
  }

  _reducer(res, item) {
    const age = this._endTime - new Date(item.last_changed).getTime();
    const interval = (age / ONE_HOUR * this.points) - this.hours * this.points;
    if (interval < 0) {
      const key = Math.floor(Math.abs(interval));
      if (!res[key]) res[key] = [];
      res[key].push(item);
    } else {
      res[0] = [item];
    }
    return res;
  }

  _calcPoints(history) {
    let xRatio = this.width / (this.hours * this.points - 1);
    xRatio = Number.isFinite(xRatio) ? xRatio : this.width;

    const coords = [];
    let last = history.filter(Boolean)[0];
    let x;
    for (let i = 0; i < history.length; i += 1) {
      x = xRatio * i + this.margin[X];
      if (history[i]) {
        last = history[i];
        coords.push([x, 0, this._calcPoint(last)]);
      } else {
        coords.push([x, 0, this._lastValue(last)]);
      }
    }
    return coords;
  }

  _calcY(coords) {
    const coords2 = coords.map((coord) => {
      const val = this._logarithmic ? Math.log10(Math.max(1, coord[V])) : coord[V];
      const coordY = this.height - ((val - this._lmin) / this._yRatio) + this.margin[Y] * 2;
      return [coord[X], coordY, coord[V]];
    });

    return coords2;
  }

  getPoints() {
    let { coords } = this;
    if (coords.length === 1) {
      coords[1] = [this.width + this.margin[X], 0, coords[0][V]];
    }
    coords = this._calcY(this.coords);
    if (this._smoothing && this._smoothing !== 'bezierc') {
      let last = coords[0];
      coords.shift();
      return coords.map((point, i) => {
        const Z = this._midPoint(last[X], last[Y], point[X], point[Y]);
        const sum = (last[V] + point[V]) / 2;
        last = point;
        return [Z[X], Z[Y], sum, i + 1];
      });
    } else {
      return coords.map((point, i) => [point[X], point[Y], point[V], i]);
    }
  }

  /**
   * Generate a SVG path for a Cubic Bezier curve
   * @param coords Array of X, Y, Value
   * @returns SVG path for a Cubic Bezier curve
   */
  genBezierCPath(coords) {
    // Starting point with x with coords[0][0] and y with coords[0][Y]
    let path = `${coords[0][0]},${coords[0][Y]}`;
    const tension = this._tension; // Default 0.15

    coords.forEach((_, i, arr) => {
      if (i === arr.length - 1) return;
      const p0 = (i - 1 >= 0) ? arr[i - 1] : arr[i];
      const p1 = arr[i];
      const p2 = arr[i + 1];
      const p3 = (i + 2 < arr.length) ? arr[i + 2] : p2;

      // First control point (close to p1)
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[Y] + (p2[Y] - p0[Y]) * tension;

      // Second control point (close to p2)
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[Y] - (p3[Y] - p1[Y]) * tension;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[Y]}`;
    });
    return path;
  }

  getPath() {
    let { coords } = this;
    if (coords.length === 1) {
      coords[1] = [this.width + this.margin[X], 0, coords[0][V]];
    }
    coords = this._calcY(this.coords);
    let path = '';

    // Cubic Bezier curve
    if (this._smoothing === 'bezierc') {
      path = `M ${this.genBezierCPath(coords)}`;
      return path;
    }

    let next; let Z;
    let last = coords[0];
    path += `M${last[X]},${last[Y]}`;

    coords.forEach((point) => {
      next = point;
      Z = this._smoothing ? this._midPoint(last[X], last[Y], next[X], next[Y]) : next;
      path += ` ${Z[X]},${Z[Y]}`;
      path += ` Q ${next[X]},${next[Y]}`;
      last = next;
    });
    path += ` ${next[X]},${next[Y]}`;
    return path;
  }

  computeGradient(thresholds, logarithmic, xLabelsHeight) {
    const scale = logarithmic
      ? Math.log10(Math.max(1, this._max)) - Math.log10(Math.max(1, this._min))
      : (this._max - this._min) * (1 + xLabelsHeight / this.height);

    return thresholds.map((stop, index, arr) => {
      let color;
      if (stop.value > this._max && arr[index + 1]) {
        const factor = (this._max - arr[index + 1].value) / (stop.value - arr[index + 1].value);
        color = interpolateRgb(arr[index + 1].color, stop.color)(factor);
      } else if (stop.value < this._min && arr[index - 1]) {
        const factor = (arr[index - 1].value - this._min) / (arr[index - 1].value - stop.value);
        color = interpolateRgb(arr[index - 1].color, stop.color)(factor);
      }
      let offset;
      if (scale <= 0) {
        offset = 0;
      } else if (logarithmic) {
        offset = (Math.log10(Math.max(1, this._max))
          - Math.log10(Math.max(1, stop.value)))
          * (100 / scale);
      } else {
        offset = (this._max - stop.value) * (100 / scale);
      }
      // Update position of gradient by accounting the margin into the offset
      offset = (this.margin[Y] * 2 * 100 + offset * this.height)
        / (this.height + this.margin[Y] * 4);
      return {
        color: color || stop.color,
        offset,
      };
    });
  }

  getFill(path, xLabelsFill) {
    let height = this.baselineCoordY;
    if (this.baselineRatio === 1) height += xLabelsFill;
    let fill = path;
    // note that currently this.margin[X] = 0 when fill is defined
    fill += ` L ${this.width + this.margin[X]}, ${height}`;
    fill += ` L ${this.coords[0][X]}, ${height} z`;
    return fill;
  }

  getBars() {
    const coords = this._calcY(this.coords);
    const len = coords.length;
    if (len === 0) return [];

    const stepMultiplier = this._barStepMultiplier;
    const baseExpression = this._barBaseExpression;
    const barWidth = this._barWidth;
    const baselineY = this.baselineCoordY;

    const bars = new Array(len);
    for (let i = 0; i < len; i += 1) {
      const coord = coords[i];
      const [, coordY, coordV] = coord;

      const minY = coordY < baselineY ? coordY : baselineY;
      const maxY = coordY > baselineY ? coordY : baselineY;

      bars[i] = {
        x: (stepMultiplier * i) + baseExpression,
        y: minY,
        height: maxY - minY,
        width: barWidth,
        value: coordV,
      };
    }

    return bars;
  }

  _midPoint(Ax, Ay, Bx, By) {
    const Zx = (Ax - Bx) / 2 + Bx;
    const Zy = (Ay - By) / 2 + By;
    return [Zx, Zy];
  }

  _average(items) {
    return items.reduce((sum, entry) => (sum + parseFloat(entry.state)), 0) / items.length;
  }

  _median(items) {
    const itemsDup = [...items].sort((a, b) => parseFloat(a) - parseFloat(b));
    const mid = Math.floor((itemsDup.length - 1) / 2);
    if (itemsDup.length % 2 === 1)
      return parseFloat(itemsDup[mid].state);
    return (parseFloat(itemsDup[mid].state) + parseFloat(itemsDup[mid + 1].state)) / 2;
  }

  _maximum(items) {
    return Math.max(...items.map(item => item.state));
  }

  _minimum(items) {
    return Math.min(...items.map(item => item.state));
  }

  _first(items) {
    return parseFloat(items[0].state);
  }

  _last(items) {
    return parseFloat(items[items.length - 1].state);
  }

  _sum(items) {
    return items.reduce((sum, entry) => sum + parseFloat(entry.state), 0);
  }

  _delta(items) {
    return this._maximum(items) - this._minimum(items);
  }

  _diff(items) {
    return this._last(items) - this._first(items);
  }

  _lastValue(items) {
    if (['delta', 'diff'].includes(this.aggregateFuncName)) {
      return 0;
    } else {
      return parseFloat(items[items.length - 1].state) || 0;
    }
  }

  _updateEndTime() {
    this._endTime = new Date();
    switch (this._groupBy) {
      case 'month':
        this._endTime.setMonth(this._endTime.getMonth() + 1);
        this._endTime.setDate(1);
        break;
      case 'date':
        this._endTime.setDate(this._endTime.getDate() + 1);
        this._endTime.setHours(0, 0, 0, 0);
        break;
      case 'hour':
        this._endTime.setHours(this._endTime.getHours() + 1);
        this._endTime.setMinutes(0, 0, 0);
        break;
      default:
        break;
    }
  }
}
