import fs from 'fs';
import fg from 'fast-glob';
import path from 'path';
import { extractJsxComponents } from './utils/parse-jsx-ast.js';
import { extractHtmlComponents } from './utils/parse-html-ast.js';
import { extractCssTokens } from './utils/parse-css-tokens.js';

const OUTPUT_PATH = path.resolve('reports/web-usage.json');
const DS_PREFIXES = ['nb', 'idsw', 'voxel'];

const usageMap = {
  framework: 'unknown'
};

for (const prefix of DS_PREFIXES) {
  usageMap[prefix] = {
    components: {},
    classes: {},
    customProperties: {},
    scssVariables: {},
    outsideComponents: {},
    directives: {},
    propValues: {},
    internalComponents: {}
  };
}

if (fs.existsSync('angular.json')) usageMap.framework = 'angular';
else if (fs.existsSync('vite.config.ts') || fs.existsSync('vite.config.js')) usageMap.framework = 'react-vite';
else if (fs.existsSync('next.config.js')) usageMap.framework = 'nextjs';
else if (fs.existsSync('vue.config.js')) usageMap.framework = 'vue';
else if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    if (pkg.dependencies?.react) usageMap.framework = 'react';
    else if (pkg.dependencies?.vue) usageMap.framework = 'vue';
    else if (pkg.dependencies?.svelte) usageMap.framework = 'svelte';
  } catch {}
}

const allFiles = await fg(['**/*.{ts,tsx,js,jsx,html,vue,css,scss}'], {
  ignore: ['node_modules', 'dist', 'build', 'reports', 'analyzer']
});

const jsxFiles = allFiles.filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
const htmlFiles = allFiles.filter(f => f.endsWith('.html') || f.endsWith('.vue'));
const cssFiles = allFiles.filter(f => f.endsWith('.css') || f.endsWith('.scss'));

// 🔍 Análise JSX via AST
for (const file of jsxFiles) {
  for (const prefix of DS_PREFIXES) {
    const propsFound = extractJsxComponents(file, [prefix.charAt(0).toUpperCase() + prefix.slice(1)]);
    const target = usageMap[prefix];

    for (const [tag, props] of Object.entries(propsFound)) {
      target.components[tag] = (target.components[tag] || 0) + 1;
      if (!target.propValues[tag]) target.propValues[tag] = {};

      for (const [prop, values] of Object.entries(props)) {
        if (!target.propValues[tag][prop]) target.propValues[tag][prop] = [];
        for (const v of values) {
          if (!target.propValues[tag][prop].includes(v)) {
            target.propValues[tag][prop].push(v);
          }
        }
      }
    }
  }

  const content = fs.readFileSync(file, 'utf-8');
  for (const prefix of DS_PREFIXES) {
    const target = usageMap[prefix];
    const htmlStrings = [...content.matchAll(/<[^>]+?>/g)].map(m => m[0]);

    for (const html of htmlStrings) {
      const htmlResult = extractHtmlComponents(html, prefix);

      for (const [tag, props] of Object.entries(htmlResult.propValues || {})) {
        target.components[tag] = (target.components[tag] || 0) + 1;
        if (!target.propValues[tag]) target.propValues[tag] = {};
        for (const [prop, values] of Object.entries(props)) {
          if (!target.propValues[tag][prop]) target.propValues[tag][prop] = [];
          for (const value of values) {
            if (!target.propValues[tag][prop].includes(value)) {
              target.propValues[tag][prop].push(value);
            }
          }
        }
      }

      for (const directive of htmlResult.directives || []) {
        target.directives[directive] = (target.directives[directive] || 0) + 1;
      }

      for (const [comp, count] of Object.entries(htmlResult.outsideComponents || {})) {
        target.outsideComponents[comp] = (target.outsideComponents[comp] || 0) + count;
      }
    }
  }
}

// 🔍 Análise HTML/Vue via AST
for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const prefix of DS_PREFIXES) {
    const result = extractHtmlComponents(content, prefix);
    const target = usageMap[prefix];

    for (const directive of result.directives || []) {
      target.directives[directive] = (target.directives[directive] || 0) + 1;
    }

    for (const [tag, props] of Object.entries(result.propValues)) {
      target.components[tag] = (target.components[tag] || 0) + 1;
      if (!target.propValues[tag]) target.propValues[tag] = {};

      for (const [prop, values] of Object.entries(props)) {
        if (!target.propValues[tag][prop]) target.propValues[tag][prop] = [];
        for (const v of values) {
          if (!target.propValues[tag][prop].includes(v)) {
            target.propValues[tag][prop].push(v);
          }
        }
      }
    }

    for (const cls of result.classes) {
      target.classes[cls] = (target.classes[cls] || 0) + 1;
    }

    for (const token of result.customProperties) {
      target.customProperties[token] = (target.customProperties[token] || 0) + 1;
    }

    for (const scss of result.scssVariables) {
      target.scssVariables[scss] = (target.scssVariables[scss] || 0) + 1;
    }

    for (const [comp, count] of Object.entries(result.outsideComponents || {})) {
      target.outsideComponents[comp] = (target.outsideComponents[comp] || 0) + count;
    }
  }
}

// 🔍 Análise de CSS/SCSS por prefixo
for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const prefix of DS_PREFIXES) {
    const tokens = extractCssTokens(content, prefix);
    const target = usageMap[prefix];

    for (const token of tokens.customProperties) {
      target.customProperties[token] = (target.customProperties[token] || 0) + 1;
    }

    for (const token of tokens.scssVariables) {
      target.scssVariables[token] = (target.scssVariables[token] || 0) + 1;
    }
  }
}

const reportsDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(usageMap, null, 2));
console.log(`✅ Web usage report saved to ${OUTPUT_PATH}`);
