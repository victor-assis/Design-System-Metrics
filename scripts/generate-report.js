import fs from 'fs';
import path from 'path';

const INPUT_PATH = path.resolve('reports/web-usage.json');
const OUTPUT_JSON = path.resolve('analyzer/reports/final-report.json');
const OUTPUT_MD = path.resolve('analyzer/reports/final-report.md');

const reportsDir = path.dirname(OUTPUT_JSON);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error('❌ web-usage.json não encontrado.');
  process.exit(1);
}

const usageMap = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
const { framework, ...systems } = usageMap;

const count = obj => Object.values(obj || {}).reduce((acc, val) => acc + val, 0);

const markdownSections = [];
const finalReport = { framework, score: 0, systems: {} };

for (const [prefix, data] of Object.entries(systems)) {
  const total =
    count(data.components) +
    count(data.classes) +
    count(data.customProperties) +
    count(data.scssVariables) +
    count(data.directives);

  const totalInternal = Object.values(data.internalComponents || {}).reduce(
    (acc, val) => acc + val.count,
    0
  );

  let score = 0;
if (total > 0 && totalInternal > 0) {
  score = Math.round((total / (total + totalInternal)) * 100);
} else if (total > 0) {
  score = 100;
}
  finalReport.score += score;
  finalReport.systems[prefix] = { ...data, score };

  let md = `## Design System: \`${prefix}\`
`;
  md += `**Adoção estimada:** ${score}%

`;

  const formatList = (title, obj) => {
    if (!obj || Object.keys(obj).length === 0) return '';
    return `### ${title}\n` +
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([key, val]) => `- \`${key}\`: **${val}**`)
        .join('\n') +
      '\n\n';
  };

  const renderPropsMarkdown = data => {
    if (!data || Object.keys(data).length === 0) return '';
    let md = `### 🧬 Props usadas por componente\n\n`;
    for (const [component, props] of Object.entries(data)) {
      md += `**${component}**\n`;
      for (const [prop, values] of Object.entries(props)) {
        md += `- \`${prop}\`: ${values.map(v => `\`${v}\``).join(', ')}\n`;
      }
      md += '\n';
    }
    return md;
  };

  const renderInternalsMarkdown = data => {
    if (!data || Object.keys(data).length === 0) return '';
    let md = `### 🧩 Componentes internos da aplicação\n\n`;
    for (const [comp, info] of Object.entries(data)) {
      md += `**\`${comp}\`** — usado **${info.count}x**\n`;
      const used = info.dsComponentsUsed;
      if (Object.keys(used).length === 0) {
        md += `- *(sem uso de componentes do design system)*\n\n`;
      } else {
        for (const [dsComp, count] of Object.entries(used)) {
          md += `- \`${dsComp}\`: **${count}** uso(s)\n`;
        }
        md += '\n';
      }
    }
    return md;
  };

  md += formatList('🧩 Componentes (tags)', data.components);
  md += formatList('🎨 Classes CSS', data.classes);
  md += formatList('🧪 CSS Custom Properties', data.customProperties);
  md += formatList('💠 SCSS Tokens', data.scssVariables);
  md += formatList('🔷 Diretivas Angular/Vue', data.directives);
  md += renderPropsMarkdown(data.propValues);
  md += formatList('🚫 Componentes fora do Design System', data.outsideComponents);
  md += renderInternalsMarkdown(data.internalComponents);

  markdownSections.push(md);
}

finalReport.score = Math.round(finalReport.score / Object.keys(systems).length);

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalReport, null, 2));
fs.writeFileSync(OUTPUT_MD, markdownSections.join('\n---\n\n'));

console.log(`✅ Markdown and JSON reports saved.`);
