import fs from 'fs';
import path from 'path';

const WEB_REPORT_PATH = path.resolve('reports/web-usage.json');
const OUTPUT_MD_PATH = path.resolve('analyzer/reports/final-report.md');
const OUTPUT_JSON_PATH = path.resolve('analyzer/reports/final-report.json');
const OUTPUT_SCORE_SVG = path.resolve('analyzer/reports/score-badge.svg');
const LIB_NAME = '@nebular/theme';

if (!fs.existsSync(WEB_REPORT_PATH)) {
  console.error('❌ web-usage.json não encontrado.');
  process.exit(1);
}

const web = JSON.parse(fs.readFileSync(WEB_REPORT_PATH, 'utf-8'));
const framework = web.framework || 'unknown';
const isAngular = framework === 'angular';

let dsVersion = 'não instalada';
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  dsVersion = pkg.dependencies?.[LIB_NAME] || pkg.devDependencies?.[LIB_NAME] || dsVersion;
} catch {}

function count(obj) {
  return Object.values(obj || {}).reduce((acc, val) => acc + val, 0);
}

function formatSection(title, obj) {
  if (!obj || Object.keys(obj).length === 0) return '';
  const list = Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([key, val]) => `- \`${key}\`: **${val}**`);
  return `### ${title}\n\n${list.join('\n')}\n\n`;
}

function formatProps(propValues) {
  if (!propValues || Object.keys(propValues).length === 0) return '';
  let md = `### 🧬 Props usadas por componente\n\n`;
  for (const [component, props] of Object.entries(propValues)) {
    md += `#### \`${component}\`\n`;
    for (const [prop, values] of Object.entries(props)) {
      const vals = values.map(v => `\`${v}\``).join(', ');
      md += `- \`${prop}\`: ${vals}\n`;
    }
    md += '\n';
  }
  return md;
}

function formatInternalComponents(internals) {
  if (!internals || Object.keys(internals).length === 0) return '';
  let md = `### 🧩 Componentes internos da aplicação\n\n`;
  for (const [comp, data] of Object.entries(internals)) {
    md += `#### \`${comp}\` — usado **${data.count}x**\n`;
    const ds = data.dsComponentsUsed;
    if (Object.keys(ds).length === 0) {
      md += `- *(sem uso de componentes do design system)*\n\n`;
    } else {
      for (const [dsComp, times] of Object.entries(ds)) {
        md += `- \`${dsComp}\`: **${times}** uso(s)\n`;
      }
      md += '\n';
    }
  }
  return md;
}

const dsTotal = count(web.components)
  + (isAngular ? 0 : count(web.classes))
  + count(web.customProperties);

const totalCustomTags = count(web.components) + count(web.outsideComponents) + count(web.externalDS);
const totalTokens = count(web.customProperties);
const totalClasses = isAngular ? 0 : count(web.classes);
const totalPropUsages = Object.values(web.propValues || {}).reduce((acc, compProps) => {
  for (const values of Object.values(compProps)) {
    acc += values.length;
  }
  return acc;
}, 0);

const totalRelevant = totalCustomTags + totalTokens + totalClasses + totalPropUsages;
const dsScore = totalRelevant > 0 ? Math.round((dsTotal / totalRelevant) * 100) : 0;

let md = `# 📊 Design System Usage Report\n\n`;
md += `## 🧠 Framework detectado: **${framework}**\n\n`;
md += `## 🔢 Índice de Adoção do Design System\n\n`;
md += `Este projeto utiliza **${dsScore}%** de recursos padronizados do Design System.\n\n`;
md += `- Total de elementos analisados: **${totalRelevant}**\n`;
md += `- Elementos pertencentes ao DS: **${dsTotal}**\n`;
md += `- Versão detectada de \`${LIB_NAME}\`: **${dsVersion}**\n\n`;

if (dsTotal > 0) {
  md += `✅ **O Design System está sendo usado nesta aplicação.**\n\n`;

  md += formatSection('🧩 Componentes (tags)', web.components);
  if (!isAngular) md += formatSection('🎨 Classes CSS', web.classes);
  md += formatSection('🧪 CSS Custom Properties', web.customProperties);
  md += formatSection('🔷 Diretivas Angular (atributos)', web.directives);
  md += formatProps(web.propValues);
  md += formatSection('🚫 Componentes fora do Design System', web.outsideComponents);
  md += formatSection('🎯 Componentes de outros Design Systems detectados', web.externalDS);
  md += formatInternalComponents(web.internalComponents);
} else {
  md += `❌ **Nenhum uso do Design System foi encontrado.**\n\n`;
  md += `➡️ Considere instalar com:\n\n`;
  md += `\`\`\`sh\nnpm install ${LIB_NAME}\n\`\`\`\n\n`;
}

const reportsDir = path.dirname(OUTPUT_MD_PATH);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_MD_PATH, md);
fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify({ web, score: dsScore, version: dsVersion }, null, 2));

const badge = `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='20'>
  <rect width='150' height='20' fill='#555'/>
  <rect x='70' width='80' height='20' fill='${dsScore >= 75 ? '#4c1' : dsScore >= 50 ? '#dfb317' : '#e05d44'}'/>
  <text x='5' y='14' fill='#fff' font-family='Verdana' font-size='11'>DS Usage</text>
  <text x='75' y='14' fill='#fff' font-family='Verdana' font-size='11'>${dsScore}%</text>
</svg>`;
fs.writeFileSync(OUTPUT_SCORE_SVG, badge);

console.log('✅ Final report generated.');
