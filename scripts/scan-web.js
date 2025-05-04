import fs from 'fs';
import fg from 'fast-glob';
import path from 'path';

const OUTPUT_PATH = path.resolve('reports/web-usage.json');
const TAG_PREFIX = 'nb-';
const TAG_FUNC_PREFIX = 'Nd';
const CLASS_PREFIX = 'nb-';
const CSS_VAR_PREFIX = '--nb-';
const SCSS_VAR_PREFIX = '\\$nb';

const ANGULAR_NATIVE_TAGS = new Set([
  'ng-container', 'ng-template', 'ng-content', 'router-outlet',
]);

const ANGULAR_DIRECTIVES = new Set([
  '*ngIf', '*ngFor', 'ngIf', 'ngFor', 'ngClass', 'ngStyle', 'ngSwitch',
  'ngSwitchCase', 'ngSwitchDefault', 'ngModel', 'ngSubmit', 'ngForm'
]);

const VUE_DIRECTIVES = new Set([
  'v-if', 'v-else-if', 'v-else', 'v-for', 'v-show', 'v-model', 'v-bind',
  'v-on', 'v-text', 'v-html', 'v-slot', 'v-pre', 'v-cloak', 'v-once'
]);

const usageMap = {
  components: {},
  classes: {},
  customProperties: {},
  scssVariables: {},
  outsideComponents: {},
  directives: {},
  propValues: {},
  internalComponents: {},
  framework: 'unknown'
};

const definedComponents = {
  tags: new Set(),
  jsx: new Set()
};

const isAngular = fs.existsSync('angular.json');
if (isAngular) usageMap.framework = 'angular';
else if (fs.existsSync('vite.config.ts') || fs.existsSync('vite.config.js')) usageMap.framework = 'react-vite';
else if (fs.existsSync('next.config.js')) usageMap.framework = 'nextjs';
else if (fs.existsSync('vue.config.js')) usageMap.framework = 'vue';
else if (fs.existsSync('svelte.config.js')) usageMap.framework = 'svelte';
else if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    if (pkg.dependencies?.react) usageMap.framework = 'react';
    else if (pkg.dependencies?.vue) usageMap.framework = 'vue';
    else if (pkg.dependencies?.svelte) usageMap.framework = 'svelte';
  } catch {}
}

const reportsDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const allFiles = await fg(['**/*.{ts,tsx,js,jsx,html,vue,css,scss}'], {
  ignore: ['node_modules', 'dist', 'build', 'reports', 'analyzer']
});

const files = allFiles.filter(f => !f.endsWith('.css') && !f.endsWith('.scss'));
const cssFiles = allFiles.filter(f => f.endsWith('.css') || f.endsWith('.scss'));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\/\*([\s\S]*?)\*\//g, '');

  const angularSelectorRegex = /@Component\s*\(\s*{[^}]*selector\s*:\s*['"`]?([a-z0-9-]+)['"`]?/gi;
  for (const match of content.matchAll(angularSelectorRegex)) {
    definedComponents.tags.add(match[1]);
  }

  const reactDefinitionRegex = /\b(?:function|const|class)\s+([A-Z][a-zA-Z0-9_]*)\b/g;
  for (const match of content.matchAll(reactDefinitionRegex)) {
    definedComponents.jsx.add(match[1]);
  }
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/\/\*([\s\S]*?)\*\//g, '');

  const tagRegex = new RegExp(`<(${TAG_PREFIX}[a-z0-9-]+)\\b`, 'gi');
  for (const match of content.matchAll(tagRegex)) {
    const tag = match[1];
    usageMap.components[tag] = (usageMap.components[tag] || 0) + 1;
  }

  const classRegex = new RegExp(`class=["'][^"']*(${CLASS_PREFIX}[a-z0-9-_]+)[^"']*["']`, 'gi');
  for (const match of content.matchAll(classRegex)) {
    const classAttr = match[0];
    const classes = classAttr.match(new RegExp(`${CLASS_PREFIX}[a-z0-9-_]+`, 'gi'));
    if (classes) {
      for (const cls of classes) {
        usageMap.classes[cls] = (usageMap.classes[cls] || 0) + 1;
      }
    }
  }

  const directiveRegex = new RegExp(`\\b( ${CLASS_PREFIX.replace('-', '')}[a-zA-Z0-9-]+)\\b`, 'gi');
  const tagMatches = content.matchAll(/<[^>]+>/g);

  for (const tagMatch of tagMatches) {
    const tagContent = tagMatch[0];
    for (const match of tagContent.matchAll(directiveRegex)) {
      const directive = match[0].trim();
      usageMap.directives[directive] = (usageMap.directives[directive] || 0) + 1;
    }
  }

  const customTagRegex = /<([a-z][a-z0-9-]*)\b/gi;
  for (const match of content.matchAll(customTagRegex)) {
    const tag = match[1];
    const isCustom = tag.includes('-') && !tag.startsWith(TAG_PREFIX) && !definedComponents.tags.has(tag);
    const isAngularNative = isAngular && ANGULAR_NATIVE_TAGS.has(tag);
    if (isCustom && !isAngularNative) {
      usageMap.outsideComponents[tag] = (usageMap.outsideComponents[tag] || 0) + 1;
    }
  }

  if (isAngular) {
    const internalTagRegex = /<([a-z][a-z0-9-]*)\b/gi;
    for (const match of content.matchAll(internalTagRegex)) {
      const tag = match[1];
      if (definedComponents.tags.has(tag)) {
        if (!usageMap.internalComponents[tag]) {
          usageMap.internalComponents[tag] = { count: 0, dsComponentsUsed: {} };
        }
        usageMap.internalComponents[tag].count += 1;

        const dsTagRegex = new RegExp(`<(${TAG_PREFIX}[a-z0-9-]+)\\b`, 'gi');
        for (const dsMatch of content.matchAll(dsTagRegex)) {
          const dsTag = dsMatch[1];
          usageMap.internalComponents[tag].dsComponentsUsed[dsTag] =
            (usageMap.internalComponents[tag].dsComponentsUsed[dsTag] || 0) + 1;
        }
      }
    }
  }

  const htmlTagRegex = new RegExp(`<(${TAG_PREFIX}[a-z0-9-]+)([^>]*)>`, 'gi');
  for (const match of content.matchAll(htmlTagRegex)) {
    const tag = match[1];
    const attrs = match[2];
    if (!usageMap.propValues[tag]) usageMap.propValues[tag] = {};
    const attrRegex = /([a-zA-Z0-9-]+)="([^"]+)"/g;
    for (const attrMatch of attrs.matchAll(attrRegex)) {
      const prop = attrMatch[1];
      const value = attrMatch[2];
      if (!ANGULAR_DIRECTIVES.has(prop) && !VUE_DIRECTIVES.has(prop)) {
        if (!usageMap.propValues[tag][prop]) usageMap.propValues[tag][prop] = [];
        if (!usageMap.propValues[tag][prop].includes(value)) {
          usageMap.propValues[tag][prop].push(value);
        }
      }
    }
  }

  const jsxTagRegex = new RegExp(`<(${TAG_FUNC_PREFIX}[A-Z][a-zA-Z0-9]*)([^>]*)>`, 'g');
  for (const match of content.matchAll(jsxTagRegex)) {
    const tag = match[1];
    const attrs = match[2];
    if (!usageMap.propValues[tag]) usageMap.propValues[tag] = {};
    const attrRegex = /([a-zA-Z0-9-]+)="([^"]+)"/g;
    for (const attrMatch of attrs.matchAll(attrRegex)) {
      const prop = attrMatch[1];
      const value = attrMatch[2];
      if (!usageMap.propValues[tag][prop]) usageMap.propValues[tag][prop] = [];
      if (!usageMap.propValues[tag][prop].includes(value)) {
        usageMap.propValues[tag][prop].push(value);
      }
    }
  }
}

for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf-8')
    .replace(/\/\*([\s\S]*?)\*\//g, '');

  const varRegex = new RegExp(`var\\(\\s*(${CSS_VAR_PREFIX}[a-z0-9-_]+)\\s*\\)`, 'gi');
  for (const match of content.matchAll(varRegex)) {
    const varName = match[1];
    usageMap.customProperties[varName] = (usageMap.customProperties[varName] || 0) + 1;
  }

  const scssRegex = new RegExp(`${SCSS_VAR_PREFIX}[a-z0-9-_]+`, 'gi');
  for (const match of content.matchAll(scssRegex)) {
    const varName = match[0];
    usageMap.scssVariables[varName] = (usageMap.scssVariables[varName] || 0) + 1;
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(usageMap, null, 2));
console.log(`✅ Web usage report saved to ${OUTPUT_PATH}`);
