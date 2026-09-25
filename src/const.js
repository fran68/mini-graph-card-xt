const URL_DOCS = 'https://github.com/fran68/mini-graph-card/blob/master/README.md';
const FONT_SIZE = 14;
const FONT_SIZE_HEADER = 14;
const DEFAULT_LINE_WIDTH = 5;
const X_LABELS_HEIGHT = 25;
const MAX_BARS = 96;
const ICONS = {
  humidity: 'hass:water-percent',
  illuminance: 'hass:brightness-5',
  temperature: 'hass:thermometer',
  battery: 'hass:battery',
  pressure: 'hass:gauge',
  power: 'hass:flash',
  signal_strength: 'hass:wifi',
  motion: 'hass:walk',
  door: 'hass:door-closed',
  window: 'hass:window-closed',
  presence: 'hass:account',
  light: 'hass:lightbulb',
};
const DEFAULT_COLORS = [
  'var(--accent-color)',
  '#3498db',
  '#e74c3c',
  '#9b59b6',
  '#f1c40f',
  '#2ecc71',
  '#1abc9c',
  '#34495e',
  '#e67e22',
  '#7f8c8d',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
];
const UPDATE_PROPS = ['entity', 'line', 'length', 'fill', 'points', 'tooltip', 'abs', 'config'];
const DEFAULT_SHOW = {
  name: true,
  icon: true,
  state: true,
  graph: 'line',
  labels: 'hover',
  labels_secondary: 'hover',
  extrema: false,
  legend: true,
  fill: true,
  points: 'hover',
};
const LINE_STYLES = {
  dotted: '0.1 6',
  dashed: '12 8',
  dashdot: '12 8 0.1 8',
  solid: 'none',
};

const X = 0;
const Y = 1;
const V = 2;
const ONE_HOUR = 1000 * 3600;
// TIME_STEPS in (partial of) hours
// 1 / 60, 2 / 60, 3 / 60, 4 / 60, 5 / 60, 6 / 60, 10 / 60, 12 / 60, 15 / 60, 20 / 60, 30 / 60,
const TIME_STEPS = [
  1 / 60, 1 / 30, 1 / 20, 1 / 15, 1 / 12, 1 / 10, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2,
  1, 2, 3, 4, 6, 8, 12, 24,
];

export {
  URL_DOCS,
  FONT_SIZE,
  FONT_SIZE_HEADER,
  DEFAULT_LINE_WIDTH,
  X_LABELS_HEIGHT,
  MAX_BARS,
  ICONS,
  DEFAULT_COLORS,
  UPDATE_PROPS,
  DEFAULT_SHOW,
  LINE_STYLES,
  X,
  Y,
  V,
  ONE_HOUR,
  TIME_STEPS,
};
