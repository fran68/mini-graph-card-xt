import { LitElement, html, svg } from 'lit-element';
import localForage from 'localforage/src/localforage';
import { stateIcon } from 'custom-card-helpers';
import SparkMD5 from 'spark-md5';
import { interpolateRgb } from 'd3-interpolate';
import Graph from './graph';
import style from './style';
import handleClick from './handleClick';
import buildConfig from './buildConfig';
import './initialize';
import { version } from '../package.json';

import {
  X_LABELS_HEIGHT,
  ICONS,
  UPDATE_PROPS,
  X, Y, V,
  ONE_HOUR,
  TIME_STEPS,
} from './const';
import {
  getMin, getAvg, getMax, getMinMaxNumber,
  getTime, getMilli, getTimestamp,
  compress, decompress,
  getFirstDefinedItem,
  compareArray,
  log,
} from './utils';

class MiniGraphCard extends LitElement {
  constructor() {
    super();
    this.id = Math.random()
      .toString(36)
      .substr(2, 9);
    this.config = {};
    this.bound = [0, 0];
    this.boundSecondary = [0, 0];
    this.length = [];
    this.entity = [];
    this.line = [];
    this.bar = [];
    this.abs = [];
    this.line_width = {};
    this.fill = [];
    this.points = [];
    this.gradient = [];
    this.tooltip = {};
    this.updateQueue = [];
    this.updating = false;
    this.stateChanged = false;
    this.initial = true;
    this._md5Config = undefined;
  }

  static get styles() {
    return style;
  }

  set hass(hass) {
    this._hass = hass;
    let updated = false;
    const queue = [];
    this.config.entities.forEach((entity, index) => {
      this.config.entities[index].index = index; // Required for filtered views

      // Handle static value lines
      if (typeof entity.static_value === 'number') {
        if (!this.entity[index]) {
          this.entity[index] = {
            // Fallback to a safe unique name if entity is completely omitted in YAML
            entity_id: entity.entity || `sensor.virtual_static_value_${index}`,
            state: entity.static_value.toString(),
            attributes: { friendly_name: entity.name || `Static value ${index}` },
          };
          queue.push(`${this.entity[index].entity_id}-${index}`);
          updated = true;
        }
        return; // Blocks live updates safely
      }

      const entityState = hass && hass.states[entity.entity] || undefined;
      if (entityState && this.entity[index] !== entityState) {
        this.entity[index] = entityState;
        queue.push(`${entityState.entity_id}-${index}`);
        updated = true;
      }
    });
    if (updated) {
      this.stateChanged = true;
      this.entity = [...this.entity];
      if (!this.config.update_interval && !this.updating) {
        setTimeout(() => {
          this.updateQueue = [...queue, ...this.updateQueue];
          this.updateData();
        }, this.initial ? 0 : 1000);
      } else {
        this.updateQueue = [...queue, ...this.updateQueue];
      }
    }
  }

  static get properties() {
    return {
      id: String,
      _hass: {},
      config: {},
      entity: [],
      Graph: [],
      line: [],
      shadow: [],
      length: Number,
      bound: [],
      boundSecondary: [],
      timeframe: [],
      xLabelsHeight: Number,
      abs: [],
      line_width: {},
      tooltip: {},
      updateQueue: [],
      color: String,
    };
  }

  setConfig(config) {
    this.config = buildConfig(config, this.config);
    this._md5Config = SparkMD5.hash(JSON.stringify(this.config));
    const entitiesChanged = !compareArray(this.config.entities || [], config.entities);

    if (!this.Graph || entitiesChanged) {
      if (this._hass) this.hass = this._hass;
      this.line_width = getMinMaxNumber(
        this.config.entities.filter(e => e.show_graph !== false && this.config.show.graph !== 'bar'),
        'line_width',
        this.config.line_width,
      );
      this.Graph = this.config.entities.map(
        entity => new Graph(
          500,
          this.config.height,
          [this.config.show.fill ? 0 : this.line_width.max, this.line_width.max],
          entity.set_graph,
          this.config.hours_to_show,
          this.config.points_per_hour,
          entity.aggregate_func || this.config.aggregate_func,
          this.config.group_by,
          getFirstDefinedItem(
            entity.smoothing,
            this.config.smoothing,
            entity.entity ? !entity.entity.startsWith('binary_sensor.') : false, // turn off for binary sensor by default and fallback for virtual lines
          ),
          this.config.logarithmic,
          this.config.tension,
        ),
      );
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.config.update_interval) {
      window.requestAnimationFrame(() => {
        this.updateOnInterval();
      });
      this.interval = setInterval(
        () => this.updateOnInterval(),
        this.config.update_interval * 1000,
      );
    }
  }

  disconnectedCallback() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    super.disconnectedCallback();
  }

  shouldUpdate(changedProps) {
    if (UPDATE_PROPS.some(prop => changedProps.has(prop))) {
      this.color = this.computeColor(
        this.tooltip.value !== undefined
          ? this.tooltip.value : this.getEntityState(0),
        this.tooltip.entity || 0,
      );
      return true;
    }
  }

  firstUpdated() {
    this.initial = false;
  }

  updated(changedProperties) {
    if (this.config.animate && changedProperties.has('line')) {
      if (this.length.length < this.entity.length) {
        this.shadowRoot.querySelectorAll('svg path.line').forEach((ele) => {
          this.length[ele.id] = ele.getTotalLength();
        });
        this.length = [...this.length];
      } else {
        this.length = Array(this.entity.length).fill('none');
      }
    }
  }

  render({ config } = this) {
    if (!config || !this.entity || !this._hass)
      return html``;
    if (this.config.entities.some((_, index) => this.entity[index] === undefined)) {
      return this.renderWarnings();
    }
    return html`
      <ha-card
        class="flex"
        ?group=${config.group}
        ?fill=${config.show.graph && config.show.fill}
        ?points=${config.show.points === 'hover'}
        ?labels=${config.show.labels === 'hover'}
        ?labels-secondary=${config.show.labels_secondary === 'hover'}
        ?gradient=${config.color_thresholds.length > 0}
        ?hover=${config.tap_action.action !== 'none'}
        style="font-size: ${config.font_size}px;"
        @click=${e => this.handlePopup(e, config.tap_action.entity || this.entity[0])}
      >
        ${this.renderHeader()} ${this.renderStates()} ${this.renderGraph()} ${this.renderInfo()}
      </ha-card>
    `;
  }

  renderWarnings() {
    return html`
      <hui-warning>
        <div>mini-graph-card-xt</div>
        ${this.config.entities.map((_, index) => (!this.entity[index] ? html`
          <div>
            Entity not available: ${this.config.entities[index].entity}
          </div>
        ` : html``))}
      </hui-warning>
    `;
  }


  renderHeader() {
    const {
      show, align_icon, align_header, font_size_header,
    } = this.config;
    return show.name || (show.icon && align_icon !== 'state')
      ? html`
          <div class="header flex" loc=${align_header} style="font-size: ${font_size_header}px;">
            ${this.renderName()} ${align_icon !== 'state' ? this.renderIcon() : ''}
          </div>
        `
      : '';
  }

  renderIcon() {
    if (this.config.icon_image !== undefined) {
      return html`
        <div class="icon">
          <img src="${this.config.icon_image}" height="25"/>
        </div>
      `;
    }

    const { icon, icon_adaptive_color } = this.config.show;
    return icon ? html`
      <div class="icon" loc=${this.config.align_icon}
        style=${icon_adaptive_color ? `color: ${this.color};` : ''}>
        <ha-icon .icon=${this.computeIcon(this.entity[0])}></ha-icon>
      </div>
    ` : '';
  }

  renderName() {
    if (!this.config.show.name) return;
    const name = this.tooltip.entity !== undefined
      ? this.computeName(this.tooltip.entity)
      : this.config.name || this.computeName(0);
    const color = this.config.show.name_adaptive_color ? `opacity: 1; color: ${this.color};` : '';

    return html`
      <div class="name flex">
        <span class="ellipsis" style=${color}>${name}</span>
      </div>
    `;
  }

  renderStates() {
    if (this.config.show.state)
      return html`
        <div class="states flex" loc=${this.config.align_state}>
          ${this.renderState(0)}
          <div class="states--secondary">${this.config.entities.map((entityConfig, i) => i > 0 && this.renderState(i) || '')}</div>
          ${this.config.align_icon === 'state' ? this.renderIcon() : ''}
        </div>
      `;
  }

  getObjectAttr(obj, path) {
    return path.split('.').reduce((res, key) => res && res[key], obj);
  }

  getEntityState(id) {
    const entityConfig = this.config.entities[id];
    if (entityConfig.show_graph === false) return this.entity[id].state;
    if (this.config.show.state === 'last') {
      return this.Graph[id].coords[this.Graph[id].coords.length - 1][V];
    } else if (entityConfig.attribute) {
      return this.getObjectAttr(this.entity[id].attributes, entityConfig.attribute);
    } else {
      return this.entity[id].state;
    }
  }

  renderState(id) {
    const isPrimary = id === 0; // rendering main state element?
    if (isPrimary || this.config.entities[id].show_state) {
      const state = this.getEntityState(id);
      // use tooltip data for main state element, if tooltip is active
      const { entity: tooltipEntity, value: tooltipValue } = this.tooltip;
      const isTooltip = isPrimary && tooltipEntity !== undefined;
      const value = isTooltip ? tooltipValue : state;
      const entity = isTooltip ? tooltipEntity : id;
      const entityConfig = this.config.entities[entity];
      return html`
        <div
          class="state ${!isPrimary && 'state--small'}"
          @click=${e => this.handlePopup(e, this.entity[id])}
          style=${entityConfig.state_adaptive_color ? `color: ${this.computeColor(value, entity)}` : ''}>
          ${entityConfig.show_indicator ? this.renderIndicator(value, entity) : ''}
          <span class="state__value ellipsis">
            ${this.computeState(value)}
          </span>
          <span class="state__uom ellipsis">
            ${this.computeUom(entity)}
          </span>
          ${isPrimary && this.renderStateTime() || ''}
        </div>
      `;
    }
  }

  renderStateTime() {
    if (this.tooltip.value === undefined) return;
    return html`
      <div class="state__time">
        ${this.tooltip.label ? html`
          <span class="tooltip--label">${this.tooltip.label}</span>
        ` : html`
          <span>${this.tooltip.time[0]}</span> -
          <span>${this.tooltip.time[1]}</span>
        `}
      </div>
    `;
  }

  renderGraph() {
    const ready = (this.entity[0] && !this.Graph.some(
      (element, index) => element._history === undefined
      && this.config.entities[index].show_graph !== false,
    ))
    || this.config.show.loading_indicator === false;
    return this.config.show.graph ? html`
      <div class="graph">
        ${ready ? html`
            <div class="graph__container">
              ${this.renderLabels()}
              ${this.renderLabelsSecondary()}
              <div class="graph__container__svg">
                ${this.renderSvg()}
              </div>
            </div>
            ${this.renderLegend()}
        ` : html`<ha-spinner aria-label="Loading" size="small"></ha-spinner>`}
      </div>` : '';
  }

  computeLegend(index) {
    let legend = this.computeName(index);
    const state = this.getEntityState(index);

    const { show_legend_state = false } = this.config.entities[index];

    if (show_legend_state) {
      legend += ` (${this.computeState(state)}`;
      if (!(['unavailable'].includes(state))) {
        const uom = this.computeUom(index);
        if (!(['%', ''].includes(uom)))
          legend += ' ';
        legend += `${uom}`;
      }
      legend += ')';
    }

    return legend;
  }

  renderLegend() {
    if (this.visibleLegends.length <= 1 || !this.config.show.legend) return;

    /* eslint-disable indent */
    return html`
      <div class="graph__legend">
        ${this.visibleLegends.map((entity) => {
          const legend = this.computeLegend(entity.index);
          return html`
            <div class="graph__legend__item"
              @click=${e => this.handlePopup(e, this.entity[entity.index])}
              @mouseenter=${() => this.setTooltip(entity.index, -1, this.getEntityState(entity.index), 'Current')}
              @mouseleave=${() => (this.tooltip = {})}>
              ${this.renderIndicator(this.getEntityState(entity.index), entity.index)}
              <span class="ellipsis">${legend}</span>
            </div>
          `;
        })}
      </div>
    `;
    /* eslint-enable indent */
  }

  get renderXAxis() {
    const {
      height,
      show,
      hours_to_show,
      points_per_hour,
      group_by,
      x_scale,
      x_major_breaks,
      x_format,
    } = this.config;
    if (!show.x_labels && !show.x_lines) return { xLines: [], xLabels: [] };

    // Declare or define vars
    const viewWidth = 500;
    let time_frame = hours_to_show;
    let position = 1;
    const xLabels = [];
    const xLines = [];
    let x;
    let x_date;

    // Define width for graph
    const margin = [show.fill ? 0 : this.line_width.max, this.line_width.max];
    const graphWidth = viewWidth - margin[X] * 2;

    // Default time format for x-axis
    let format = {
      locales: 'en-US',
      days: { month: 'short', day: 'numeric' },
      hours: { hour: '2-digit', minute: '2-digit' },
    };
    if (x_format) {
      format = { ...format, ...x_format };
      if (x_format.locales === 'locale') format.locales = this._hass.language;
    }
    // Override options for time format configured in utils.js and buildConfig.sh
    const format_override = {
      ...this.config.format,
      ...{
        day: undefined, weekday: undefined, hour: undefined, minute: undefined,
      },
    };

    // Visualized graph is hours_to_show less one point
    time_frame = hours_to_show - 1 / points_per_hour || 1;

    // Find best time_step [h]
    const raw = Math.max(time_frame / Math.abs(x_scale), 1 / points_per_hour);
    const fallback = Math.ceil(raw / 24) * 24;
    const time_step = TIME_STEPS.find(value => value >= raw) || fallback;

    // // Calculate interval [ms]
    const interval = getMilli(time_step);
    const point_step = 1 / (points_per_hour * time_frame);

    // Calculate start date
    const time = this.getEndDate();
    // const time = new Date(this.timeframe[1].getTime());
    const start = new Date(time);
    start.setMilliseconds(start.getMilliseconds() - getMilli(time_frame));

    // Get offset [h] for time and position (0..1) from full hour (from now to the past)
    if (time_step >= 1) {
      const time_offset = time.getHours() % time_step;
      time.setHours(time.getHours() - time_offset);
      position -= time_offset / time_frame;
    }

    // Adapt time scale for group_by option 'interval' when x_scale is a negative value
    if (group_by === 'interval' && (x_scale !== Math.abs(x_scale) && show.graph !== 'bar')) {
      const shift = (getTimestamp(time) % interval);
      time.setMilliseconds(-shift);
      position -= shift / getMilli(time_frame);
    }

    // Iterate accross elapsed time (time_frame)
    const major_interval = getMilli(time_step * (x_major_breaks || 4));

    while (time >= start) {
      // Find flags by modulo operation
      const time_stamp = getTimestamp(time);

      // Format time for labels
      const days = getTime(time, { ...format_override, ...format.days }, format.locales);
      const hours = getTime(time, { ...format_override, ...format.hours }, format.locales);
      const date_type = (time_stamp % getMilli(24) < interval) ? days : hours;

      // Format thick and thin grid lines
      // getDay() is adjusted for Monday (Sunday is 0)
      // CSS see https://github.com/kalkih/mini-graph-card/pull/1179#discussion_r1883352411
      const thick_flag = (group_by === 'date')
        ? time.getDay() === 1
        : time_stamp % major_interval < interval;
      const line_weight = thick_flag ? 'xlines--thick' : 'xlines--thin';
      const label_weight = thick_flag ? 'xlabels--thick' : 'xlabels--thin';

      x = margin[X] + position * graphWidth;
      // Adjust position for label below data point
      x_date = group_by === 'date' ? x + point_step * graphWidth / 2 : x;

      // Create array for labels
      if (show.x_labels) {
        xLabels.push(svg`
          <defs>
            <filter id="textBg" x="-16%" width="132%" y="-6%" height="112%">
              <feFlood flood-color="var(--primary-background-color, white)" flood-opacity="0.8"/>
              <feGaussianBlur stdDeviation="2"/>
              <feComposite operator="over" in="SourceGraphic"/>
            </filter>
          </defs>
          <line class="${line_weight} xlabels__tick" x1=${x} y1=${height} x2="${x}" y2=${height + 4} />
          <text class="${label_weight}" filter="${show.x_labels_inline ? 'url(#textBg)' : ''}"
            x=${x_date} y="${show.x_labels_inline ? height - 11 : height + 18}">${date_type}
          </text>
        `);
      }

      // Create array for lines
      if (show.x_lines) {
        xLines.push(svg`
          <line class="${line_weight} xlines__line" x1=${x} y1="0" x2="${x}" y2=${height} />
        `);
      }

      time.setMilliseconds(time.getMilliseconds() - interval);
      position -= time_step / time_frame;
    }

    if (show.x_labels && !show.x_labels_inline) {
      xLabels.push(svg`
        <line class="xlines--thin xlabels__axis" x1="0" y1=${height} x2="100%" y2=${height} />
      `);
    }
    if (show.x_lines) {
      xLines.push(svg`
        <line class="xlines--thin xlines__top" x1="0" y1="0" x2="100%" y2="0" />
      `);
    }

    return { xLabels, xLines };
  }

  renderIndicator(state, index) {
    return svg`
      <svg width='10' height='10'>
        <rect width='10' height='10' fill=${this.computeColor(state, index)} />
      </svg>
    `;
  }

  renderSvgFill(fill, i) {
    if (!fill) return;
    const fade = this.config.show.fill === 'fade';
    const init = this.length[i] || this.config.entities[i].show_line === false;
    const { baselineRatio: offset } = this.Graph[i];
    return svg`
      <defs>
        <linearGradient id=${`fill-grad-${this.id}-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop stop-color='white' offset='0%' stop-opacity='1'/>
          <stop stop-color='white' offset='${offset * 100}%' stop-opacity='.15'/>
          <stop stop-color='white' offset='100%' stop-opacity='1'/>
        </linearGradient>
        <mask id=${`fill-grad-mask-${this.id}-${i}`}>
          <rect width="100%" height="100%" fill=${`url(#fill-grad-${this.id}-${i})`} />
        </mask>
      </defs>
      <mask id=${`fill-${this.id}-${i}`}>
        <path class='fill'
          type=${this.config.show.fill}
          .id=${i} anim=${this.config.animate} ?init=${init}
          style="animation-delay: ${this.config.animate ? `${i * 0.5}s` : '0s'}"
          fill='white'
          mask=${fade ? `url(#fill-grad-mask-${this.id}-${i})` : ''}
          d=${this.fill[i]}
        />
      </mask>`;
  }

  renderSvgLine(line, i) {
    if (!line) return;

    const path = svg`
      <path
        class='line'
        .id=${i}
        anim=${this.config.animate} ?init=${this.length[i]}
        style="animation-delay: ${this.config.animate ? `${i * 0.5}s` : '0s'}"
        fill='none'
        stroke-dasharray=${this.length[i] || 'none'} stroke-dashoffset=${this.length[i] || 'none'}
        stroke=${'white'}
        stroke-width=${this.config.entities[i].line_width || this.config.line_width}
        d=${this.line[i]}
      />`;

    return svg`
      <mask id=${`line-${this.id}-${i}`}>
        ${path}
      </mask>
    `;
  }

  renderSvgPoint(point, i) {
    const color = this.gradient[i] ? this.computeColor(point[V], i) : 'inherit';
    return svg`
      <circle
        class='line--point'
        ?inactive=${this.tooltip.index !== point[3]}
        style=${`--mcg-hover: ${color};`}
        stroke=${color}
        fill=${color}
        cx=${point[X]} cy=${point[Y]} r=${this.config.entities[i].line_width || this.config.line_width}
        @mouseover=${() => this.setTooltip(i, point[3], point[V])}
        @mouseout=${() => (this.tooltip = {})}
      />
    `;
  }

  renderSvgPoints(points, i) {
    if (!points) return;
    const color = this.computeColor(this.entity[i].state, i);
    return svg`
      <g class='line--points'
        ?tooltip=${this.tooltip.entity === i}
        ?inactive=${this.tooltip.entity !== undefined && this.tooltip.entity !== i}
        ?init=${this.length[i]}
        anim=${this.config.animate && this.config.show.points !== 'hover'}
        style="animation-delay: ${this.config.animate ? `${i * 0.5 + 0.5}s` : '0s'}"
        fill=${color}
        stroke=${color}
        stroke-width=${(this.config.entities[i].line_width || this.config.line_width) / 2}>
        ${points.map(point => this.renderSvgPoint(point, i))}
      </g>`;
  }

  renderSvgGradient(gradients) {
    if (!gradients) return;
    const items = gradients.map((gradient, i) => {
      if (!gradient) return;
      return svg`
        <linearGradient id=${`grad-${this.id}-${i}`} gradientTransform="rotate(90)">
          ${gradient.map(stop => svg`
            <stop stop-color=${stop.color} offset=${`${stop.offset}%`} />
          `)}
        </linearGradient>`;
    });
    return svg`${items}`;
  }

  renderSvgLineRect(line, i) {
    if (!line) return;
    const fill = this.gradient[i]
      ? `url(#grad-${this.id}-${i})`
      : this.computeColor(this.entity[i].state, i);
    return svg`
      <rect class='line--rect'
        ?inactive=${this.tooltip.entity !== undefined && this.tooltip.entity !== i}
        id=${`rect-${this.id}-${i}`}
        fill=${fill} height="100%" width="100%"
        mask=${`url(#line-${this.id}-${i})`}
      />`;
  }

  renderSvgFillRect(fill, i) {
    if (!fill) return;
    const svgFill = this.gradient[i]
      ? `url(#grad-${this.id}-${i})`
      : this.computeColor(this.entity[i].state, i);
    return svg`
      <rect class='fill--rect'
        ?inactive=${this.tooltip.entity !== undefined && this.tooltip.entity !== i}
        id=${`fill-rect-${this.id}-${i}`}
        fill=${svgFill} height="100%" width="100%"
        mask=${`url(#fill-${this.id}-${i})`}
      />`;
  }

  renderSvgBars(bars, index) {
    if (!bars) return;
    const fill = ['ambient'].find(ele => ele === this.config.show.fill);
    const items = bars.map((bar, i) => {
      const animation = this.config.animate
        ? svg`
          <animate attributeName='y' from=${this.config.height} to=${bar.y} dur='1s' fill='remove'
            calcMode='spline' keyTimes='0; 1' keySplines='0.215 0.61 0.355 1'>
          </animate>`
        : '';
      const color = this.computeColor(bar.value, index);
      return svg`
        <defs>
          <linearGradient id=${`fill-ambient-${this.id}-${index}-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop stop-color='white' offset='0%' stop-opacity='1'/>
            <stop stop-color='white' offset='75%' stop-opacity='.66'/>
            <stop stop-color='white' offset='100%' stop-opacity='1'/>
          </linearGradient>
          <mask id=${`fill-ambient-mask-${this.id}-${index}-${i}`}>
            <rect x=${bar.x} y=${bar.y}
              height=${bar.height} width=${bar.width}
              fill=${`url(#fill-ambient-${this.id}-${index}-${i})`} />
          </mask>
        </defs>
        <rect class='bar' x=${bar.x} y=${bar.y}
          height=${bar.height} width=${bar.width} fill=${color}
          mask=${fill ? `url(#fill-${fill}-mask-${this.id}-${index}-${i})` : ''}
          @mouseover=${() => this.setTooltip(index, i, bar.value)}
          @mouseout=${() => (this.tooltip = {})}>
          ${animation}
        </rect>`;
    });
    return svg`
      <g
        class='bars'
        ?anim=${this.config.animate}
        ?inactive=${this.tooltip.entity !== undefined && this.tooltip.entity !== index}
      >${items}</g>`;
  }

  renderSvg() {
    const { height } = this.config;
    const { xLines, xLabels } = this.renderXAxis;
    /* eslint-disable indent */
    return svg`
      <svg width='100%' height=${height !== 0 ? '100%' : 0}
        viewBox='0 0 500 ${height + this.xLabelsHeight}'
        @click=${e => e.stopPropagation()}>
        <g class="xlines">${xLines}</g>
        <g>
          <defs>
            ${this.renderSvgGradient(this.gradient)}
          </defs>
          ${this.entity.map((_, i) => {
            if (this.bar[i]) {
              return this.renderSvgBars(this.bar[i], i);
            }
            if (this.line[i]) {
              return svg`
                ${this.renderSvgFill(this.fill[i], i)}
                ${this.renderSvgFillRect(this.fill[i], i)}
                ${this.renderSvgLine(this.line[i], i)}
                ${this.renderSvgLineRect(this.line[i], i)}
              `;
            }
            return '';
          })}
        </g>
        <g class="xlabels">${xLabels}</g>
        ${this.points.map((points, i) => this.renderSvgPoints(points, i))}
      </svg>`;
    /* eslint-enable indent */
  }

  setTooltip(entity, index, value, label = null) {
    const {
      group_by,
      points_per_hour,
      hours_to_show,
      format,
    } = this.config;

    // omit first point
    const offset = this.config.entities[entity].set_graph === 'bar' ? 1 : 0;

    // time units in milliseconds in this function
    const interval = getMilli(1 / points_per_hour);
    const n_points = Math.ceil(hours_to_show * points_per_hour - offset);

    // index is 0 (oldest) to n_points-1 (most recent ~= now)
    // count of intervals from now to end of bin
    // count is 0 (now) to n_points-1 (oldest)
    const count = (n_points - 1) - index;

    // offset end by a minute, if grouped by, e.g., date or hour
    const oneMinute = group_by !== 'interval' ? 60000 : 0;

    const now = this.getEndDate();

    now.setMilliseconds(now.getMilliseconds() - oneMinute - interval * count);
    const end = getTime(now, format, this._hass.language);
    now.setMilliseconds(now.getMilliseconds() + oneMinute - interval);
    const start = getTime(now, format, this._hass.language);

    this.tooltip = {
      value,
      count,
      entity,
      time: [start, end],
      index,
      label,
    };
  }

  renderLabels() {
    if (!this.config.show.labels || this.primaryYaxisSeries.length === 0) return;
    return html`
      <div class="graph__labels --primary flex">
        <span class="label--max">${this.computeState(this.bound[1])}</span>
        <span class="label--min" style=${this.config.show.x_labels ? 'transform: translateY(-100%);' : ''}>${this.computeState(this.bound[0])}</span>
      </div>
    `;
  }

  renderLabelsSecondary() {
    if (!this.config.show.labels_secondary || this.secondaryYaxisSeries.length === 0) return;
    return html`
      <div class="graph__labels --secondary flex">
        <span class="label--max">${this.computeState(this.boundSecondary[1])}</span>
        <span class="label--min" style=${this.config.show.x_labels ? 'transform: translateY(-100%);' : ''}>${this.computeState(this.boundSecondary[0])}</span>
      </div>
    `;
  }

  renderInfo() {
    return this.abs.length > 0 ? html`
      <div class="info flex">
        ${this.abs.map(entry => html`
          <div class="info__item">
            <span class="info__item__type">${entry.type}</span>
            <span class="info__item__value">
              ${this.computeState(entry.state)} ${this.computeUom(0)}
            </span>
            <span class="info__item__time">
              ${entry.type !== 'avg' ? getTime(new Date(entry.last_changed), this.config.format, this._hass.language) : ''}
            </span>
          </div>
        `)}
      </div>
    ` : html``;
  }

  handlePopup(e, entity) {
    e.stopPropagation();
    handleClick(this, this._hass, this.config, this.config.tap_action, entity.entity_id || entity);
  }

  get visibleEntities() {
    return this.config.entities.filter(entity => entity.show_graph !== false
      && !entity.static_value);
  }

  get primaryYaxisEntities() {
    return this.visibleEntities.filter(entity => entity.set_y_axis === 'primary');
  }

  get secondaryYaxisEntities() {
    return this.visibleEntities.filter(entity => entity.set_y_axis === 'secondary');
  }

  get visibleLegends() {
    return this.visibleEntities.filter(entity => entity.show_legend !== false);
  }

  get primaryYaxisSeries() {
    return this.primaryYaxisEntities.map(entity => this.Graph[entity.index]);
  }

  get secondaryYaxisSeries() {
    return this.secondaryYaxisEntities.map(entity => this.Graph[entity.index]);
  }

  get xLabelsHeight() {
    return (this.config.show.x_labels && !this.config.show.x_labels_inline)
      ? X_LABELS_HEIGHT : 0;
  }

  computeColor(inState, i) {
    const { color_thresholds, line_color } = this.config;
    const state = Number(inState) || 0;

    let intColor;
    if (color_thresholds.length > 0) {
      const { color } = color_thresholds.find(ele => ele.value < state)
        || color_thresholds.slice(-1)[0];
      intColor = color;
      const index = color_thresholds.findIndex(ele => ele.value < state);
      const c1 = color_thresholds[index];
      const c2 = color_thresholds[index - 1];
      if (c2) {
        const factor = (c2.value - state) / (c2.value - c1.value);
        intColor = interpolateRgb(c2.color, c1.color)(factor);
      } else {
        intColor = index
          ? color_thresholds[color_thresholds.length - 1].color
          : color_thresholds[0].color;
      }
    }

    return this.config.entities[i].color || intColor || line_color[i] || line_color[0];
  }

  computeName(index) {
    return this.config.entities[index].name
      || this.entity[index].attributes.friendly_name
      || this.entity[index].entity_id;
  }

  computeIcon(entity) {
    return (
      this.config.icon
      || entity.attributes.icon
      || stateIcon(entity)
      || ICONS.temperature
    );
  }

  computeUom(index) {
    return (
      this.config.entities[index].unit !== undefined
        ? this.config.entities[index].unit
        : (
          this.config.unit !== undefined
            ? this.config.unit
            : (
              !this.config.entities[index].attribute
                ? (this.entity[index].attributes.unit_of_measurement || '')
                : ''
            )
        )
    );
  }

  computeState(inState) {
    if (this.config.state_map.length > 0) {
      const stateMap = Number.isInteger(inState)
        ? this.config.state_map[inState]
        : this.config.state_map.find(state => state.value === inState);

      if (stateMap) {
        return stateMap.label;
      } else {
        log(`value [${inState}] not found in state_map`);
      }
    }

    let state;
    if (typeof inState === 'string') {
      state = parseFloat(inState.replace(/,/g, '.'));
    } else {
      state = Number(inState);
    }
    const dec = this.config.decimals;
    const value_factor = 10 ** this.config.value_factor;

    if (dec === undefined || Number.isNaN(dec) || Number.isNaN(state)) {
      return this.numberFormat(Math.round(state * value_factor * 100) / 100, this._hass.language);
    }

    const x = 10 ** dec;
    return this.numberFormat(
      (Math.round(state * value_factor * x) / x).toFixed(dec),
      this._hass.language, dec,
    );
  }

  numberFormat(num, language, dec) {
    if (!Number.isNaN(Number(num)) && Intl)
      return new Intl.NumberFormat(language, { minimumFractionDigits: dec }).format(Number(num));
    return num.toString();
  }

  updateOnInterval() {
    if (this.stateChanged && !this.updating) {
      this.stateChanged = false;
      this.updateData();
    }
  }

  async updateData({ config } = this) {
    this.updating = true;

    const end = this.getEndDate();
    const start = new Date(end);
    start.setMilliseconds(start.getMilliseconds() - getMilli(config.hours_to_show));
    this.timeframe = [start, end];

    try {
      const promise = this.entity.map((entity, i) => this.updateEntity(entity, i, start, end));
      await Promise.all(promise);
    } catch (err) {
      log(err);
    }


    if (config.show.graph) {
      this.entity.forEach((entity, i) => {
        if (entity) this.Graph[i].update();
      });
    }

    this.updateBounds();

    if (config.show.graph) {
      let graphPos = 0;
      this.entity.forEach((entity, i) => {
        if (!entity || this.Graph[i].coords.length === 0) return;
        const entityConfig = config.entities[i];
        const bound = entityConfig.y_axis === 'secondary' ? this.boundSecondary : this.bound;
        [this.Graph[i].min, this.Graph[i].max] = [bound[0], bound[1]];
        if (entityConfig.set_graph === 'bar') {
          const numVisible = Object.keys(config.set_groups).length;
          const stack_key = entityConfig.stack
            ? `${entityConfig.stack}_${entityConfig.set_y_axis}`
            : `standalone_${entityConfig.index}`;
          graphPos = config.set_groups[stack_key];
          this.bar[i] = this.Graph[i]
            .getBars(graphPos, numVisible, entityConfig.set_bar_spacing, config.bar_spacing_group);
          graphPos += 1;
        } else {
          const line = this.Graph[i].getPath();
          if (entityConfig.show_line !== false) this.line[i] = line;
          if (config.show.fill
            && entityConfig.show_fill !== false) this.fill[i] = this.Graph[i]
            .getFill(line, config.show.x_labels_fill && this.xLabelsHeight || 0);
          if (config.show.points && (entityConfig.show_points !== false)) {
            this.points[i] = this.Graph[i].getPoints();
          }
          if (config.color_thresholds.length > 0 && !config.entities[i].color)
            this.gradient[i] = this.Graph[i].computeGradient(
              config.color_thresholds, this.config.logarithmic, this.xLabelsHeight,
            );
        }
      });
      this.line = [...this.line];
    }
    this.updating = false;
    this.setNextUpdate();
  }

  getBoundary(type, series, configVal, fallback) {
    if (!(type in Math)) {
      throw new Error(`The type "${type}" is not present on the Math object`);
    }

    if (configVal === undefined) {
      // dynamic boundary depending on values
      return Math[type](...series.map(ele => ele[type])) || fallback;
    }
    if (configVal[0] !== '~') {
      // fixed boundary
      return configVal;
    }
    // soft boundary (respecting out of range values)
    return Math[type](Number(configVal.substr(1)), ...series.map(ele => ele[type]));
  }

  getBoundaries(series, min, max, fallback, minRange) {
    let boundary = [
      this.getBoundary('min', series, min, fallback[0]),
      this.getBoundary('max', series, max, fallback[1]),
    ];

    if (minRange) {
      const currentRange = Math.abs(boundary[0] - boundary[1]);
      const diff = parseFloat(minRange) - currentRange;

      // Doesn't matter if minBoundRange is NaN because this will be false if so
      if (diff > 0) {
        const weights = [
          min !== undefined && min[0] !== '~' || max === undefined ? 0 : 1,
          max !== undefined && max[0] !== '~' || min === undefined ? 0 : 1,
        ];
        const sum = weights[0] + weights[1];
        if (sum > 0) {
          boundary = [
            boundary[0] - diff * weights[0] / sum,
            boundary[1] + diff * weights[1] / sum,
          ];
        } else {
          boundary = [
            boundary[0] - diff / 2,
            boundary[1] + diff / 2,
          ];
        }
      }
    }

    return boundary;
  }

  updateBounds({ config } = this) {
    this.bound = this.getBoundaries(
      this.primaryYaxisSeries,
      config.lower_bound,
      config.upper_bound,
      this.bound,
      config.min_bound_range,
    );

    this.boundSecondary = this.getBoundaries(
      this.secondaryYaxisSeries,
      config.lower_bound_secondary,
      config.upper_bound_secondary,
      this.boundSecondary,
      config.min_bound_range_secondary,
    );
  }

  async getCache(key, compressed) {
    const data = await localForage.getItem(`${key}_${this._md5Config}${(compressed ? '' : '_raw')}`);
    return data ? (compressed ? decompress(data) : data) : null;
  }

  async setCache(key, data, compressed) {
    return compressed
      ? localForage.setItem(`${key}_${this._md5Config}`, compress(data))
      : localForage.setItem(`${key}_${this._md5Config}_raw`, data);
  }

  async updateEntity(entity, index, initStart, end) {
    if (!entity
      || !this.updateQueue.includes(`${entity.entity_id}-${index}`)
      || this.config.entities[index].show_graph === false
    ) return;

    // Intercept immediately if it is a static_value line
    if (typeof this.config.entities[index].static_value === 'number') {
      const value = this.config.entities[index].static_value;

      // Manually generate two data points spanning the entire timeline
      const first = {
        last_changed: initStart.toISOString(),
        last_updated: initStart.toISOString(),
        state: value,
      };
      const last = {
        last_changed: end.toISOString(),
        last_updated: end.toISOString(),
        state: value,
      };

      // Directly feed the graph history array
      this.Graph[index].history = [first, last];

      // Exit immediately to ensure fetchRecent is NEVER called!
      return;
    }

    this.updateQueue = this.updateQueue.filter(entry => entry !== `${entity.entity_id}-${index}`);

    let stateHistory = [];
    let start = initStart;
    let skipInitialState = false;

    const history = this.config.cache
      ? await this.getCache(`${entity.entity_id}_${index}`, this.config.useCompress)
      : undefined;
    if (history && history.hours_to_show === this.config.hours_to_show) {
      stateHistory = history.data;

      let currDataIndex = stateHistory.findIndex(item => new Date(item.last_changed) > initStart);
      if (currDataIndex !== -1) {
        if (currDataIndex > 0) {
          // include previous item
          currDataIndex -= 1;
          // but change it's last changed time
          stateHistory[currDataIndex].last_changed = initStart;
        }

        stateHistory = stateHistory.slice(currDataIndex, stateHistory.length);
        // skip initial state when fetching recent/not-cached data
        skipInitialState = true;
      } else {
        // there were no states which could be used in current graph so clearing
        stateHistory = [];
      }

      const lastFetched = new Date(history.last_fetched);
      if (lastFetched > start) {
        start = new Date(lastFetched - 1);
      }
    }

    let newStateHistory = await this.fetchRecent(
      entity.entity_id,
      start,
      end,
      this.config.entities[index].attribute ? false : skipInitialState,
      !!this.config.entities[index].attribute,
    );
    if (newStateHistory[0] && newStateHistory[0].length > 0) {
      /**
      * hack because HA doesn't return anything if skipInitialState is false
      * when retrieving for attributes so we retrieve it and we remove it.*
      */
      if (this.config.entities[index].attribute && skipInitialState) {
        newStateHistory[0].shift();
      }
      // check if we should convert states to numeric values
      if (this.config.state_map.length > 0 || this.config.entities[index].attribute) {
        newStateHistory[0].forEach((item) => {
          if (this.config.entities[index].attribute) {
            // eslint-disable-next-line no-param-reassign
            item.state = this.getObjectAttr(item.attributes, this.config.entities[index].attribute);
            // eslint-disable-next-line no-param-reassign
            delete item.attributes;
          }
          if (this.config.state_map.length > 0)
            this._convertState(item);
        });
      }

      newStateHistory = newStateHistory[0].filter(item => !Number.isNaN(parseFloat(item.state)));
      newStateHistory = newStateHistory.map(item => ({
        last_changed: this.config.entities[index].attribute ? item.last_updated : item.last_changed,
        state: item.state,
      }));
      stateHistory = [...stateHistory, ...newStateHistory];

      if (this.config.cache) {
        this
          .setCache(`${entity.entity_id}_${index}`, {
            hours_to_show: this.config.hours_to_show,
            last_fetched: new Date(),
            data: stateHistory,
            version,
          }, this.config.useCompress)
          .catch((err) => {
            log(err);
            localForage.clear();
          });
      }
    }

    if (stateHistory.length === 0) return;

    if (this.entity[0] && entity.entity_id === this.entity[0].entity_id) {
      this.updateExtrema(stateHistory);
    }

    if (this.config.entities[index].fixed_value === true) {
      const last = stateHistory[stateHistory.length - 1];
      this.Graph[index].history = [last, last];
    } else {
      this.Graph[index].history = stateHistory;
    }
  }

  async fetchRecent(entityId, start, end, skipInitialState, withAttributes) {
    let url = 'history/period';
    if (start) url += `/${start.toISOString()}`;
    url += `?filter_entity_id=${entityId}`;
    if (end) url += `&end_time=${end.toISOString()}`;
    if (skipInitialState) url += '&skip_initial_state';
    if (!withAttributes) url += '&minimal_response&no_attributes';
    if (withAttributes) url += '&significant_changes_only=0';
    return this._hass.callApi('GET', url);
  }

  updateExtrema(history) {
    const { extrema, average } = this.config.show;
    this.abs = [
      ...(extrema ? [{
        type: 'min',
        ...getMin(history, 'state'),
      }] : []),
      ...(average ? [{
        type: 'avg',
        state: getAvg(history, 'state'),
      }] : []),
      ...(extrema ? [{
        type: 'max',
        ...getMax(history, 'state'),
      }] : []),
    ];
  }

  _convertState(res) {
    const resultIndex = this.config.state_map.findIndex(s => s.value === res.state);
    if (resultIndex === -1) {
      return;
    }

    res.state = resultIndex;
  }

  getEndDate() {
    const date = new Date();
    switch (this.config.group_by) {
      case 'date':
        date.setDate(date.getDate() + 1);
        date.setHours(0, 0, 0, 0);
        break;
      case 'hour':
        date.setHours(date.getHours() + 1);
        date.setMinutes(0, 0, 0);
        break;
      default:
        date.setMilliseconds(0);
        break;
    }
    return date;
  }

  setNextUpdate() {
    if (!this.config.update_interval) {
      const interval = 1 / this.config.points_per_hour;
      clearInterval(this.interval);
      this.interval = setInterval(() => {
        if (!this.updating) this.updateData();
      }, interval * ONE_HOUR);
    }
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('mini-graph-card-xt', MiniGraphCard);

// Configure the preview in the Lovelace card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'mini-graph-card-xt',
  name: 'Mini Graph Card XT',
  preview: false,
  description: 'The Mini Graph card is a minimalistic and customizable graph card',
});
