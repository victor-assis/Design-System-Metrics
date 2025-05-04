import { parseDocument } from 'htmlparser2';
import { selectAll } from 'css-select';

const ANGULAR_DIRECTIVES = [
  '*ngIf', '*ngFor', 'ngIf', 'ngFor', 'ngClass', 'ngStyle', 'ngSwitch',
  'ngSwitchCase', 'ngSwitchDefault', 'ngModel', 'ngSubmit', 'ngForm'
];

const VUE_DIRECTIVES = [
  'v-if', 'v-else-if', 'v-else', 'v-for', 'v-show', 'v-model', 'v-bind',
  'v-on', 'v-text', 'v-html', 'v-slot', 'v-pre', 'v-cloak', 'v-once'
];

const COMMON_HTML_ATTRS = [
  'id', 'href', 'src', 'style', 'type', 'value', 'name', 'title', 'alt',
  'class', 'role', 'tabindex', 'placeholder', 'aria-label'
];

export function extractHtmlComponents(content, prefix) {
  const tagPrefix = prefix + '-';
  const classPrefix = prefix + '-';
  const cssVarPrefix = '--' + prefix + '-';
  const scssVarPrefix = '$' + prefix;

  const result = {
    propValues: {},
    classes: [],
    customProperties: [],
    scssVariables: [],
    directives: [],
    outsideComponents: {}
  };

  const doc = parseDocument(content);
  const elements = selectAll('*', doc);

  for (const el of elements) {
    if (!el.name || !el.attribs) continue;

    const isDSComponent = el.name.startsWith(tagPrefix);

    // Design System component
    if (isDSComponent) {
      if (!result.propValues[el.name]) result.propValues[el.name] = {};

      for (const [attr, value] of Object.entries(el.attribs)) {
        const cleanAttr = attr.replace(/[\[\]\(\)\*]/g, '');
        if (!result.propValues[el.name][cleanAttr]) {
          result.propValues[el.name][cleanAttr] = [];
        }
        if (!result.propValues[el.name][cleanAttr].includes(value)) {
          result.propValues[el.name][cleanAttr].push(value);
        }

        // Diretiva do próprio DS
        if (
          !COMMON_HTML_ATTRS.includes(cleanAttr) &&
          cleanAttr.startsWith(prefix) &&
          !result.directives.includes(cleanAttr)
        ) {
          result.directives.push(cleanAttr);
        }
      }
    }

    // Classes CSS
    const classAttr = el.attribs.class;
    if (classAttr) {
      const classes = classAttr.split(/\s+/).filter(cls => cls.startsWith(classPrefix));
      result.classes.push(...classes);
    }

    // Componentes externos com hífen que não são do DS
    if (el.name.includes('-') && !isDSComponent) {
      result.outsideComponents[el.name] = (result.outsideComponents[el.name] || 0) + 1;
    }

    // Diretivas externas
    for (const attr of Object.keys(el.attribs)) {
      const isFrameworkDirective = ANGULAR_DIRECTIVES.includes(attr) || VUE_DIRECTIVES.includes(attr);
      const isCommonAttr = COMMON_HTML_ATTRS.includes(attr);
      const isDSLike = attr.startsWith(prefix) || attr.startsWith('[' + prefix) || attr.startsWith('(' + prefix);
      const isPlainAttr = /^[a-z][a-zA-Z-]+$/.test(attr);

      if (
        isPlainAttr &&
        !isDSLike &&
        !isFrameworkDirective &&
        !isCommonAttr
      ) {
        result.outsideComponents[attr] = (result.outsideComponents[attr] || 0) + 1;
      }
    }

    // Tokens CSS
    const styleAttr = el.attribs.style;
    if (styleAttr) {
      const varMatches = styleAttr.matchAll(/var\(\s*(--[a-z0-9-_]+)\s*\)/gi);
      for (const match of varMatches) {
        const token = match[1];
        if (token.startsWith(cssVarPrefix)) result.customProperties.push(token);
      }

      const scssMatches = styleAttr.matchAll(/\$[a-z0-9-_]+/gi);
      for (const match of scssMatches) {
        const token = match[0];
        if (token.startsWith(scssVarPrefix)) result.scssVariables.push(token);
      }
    }
  }

  return result;
}
