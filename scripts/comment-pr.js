import fs from 'fs';
import { Octokit } from '@octokit/rest';

// ✅ Setup
const token = process.env.GITHUB_TOKEN;
const repoFull = process.env.GITHUB_REPOSITORY; // ex: user/repo
const prNumber = process.env.PR_NUMBER;

if (!token || !repoFull || !prNumber) {
  console.error('❌ Variáveis de ambiente faltando: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER');
  process.exit(1);
}

const [owner, repo] = repoFull.split('/');
const octokit = new Octokit({ auth: token });

const path = 'analyzer/reports/final-report.json';
if (!fs.existsSync(path)) {
  console.error('❌ final-report.json não encontrado.');
  process.exit(1);
}

const { framework, score, systems } = JSON.parse(fs.readFileSync(path, 'utf-8'));

const count = obj => Object.values(obj || {}).reduce((acc, val) => acc + val, 0);
const formatList = (title, obj) => {
  if (!obj || Object.keys(obj).length === 0) return '';
  return `### ${title}\n` +
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => `- \`${key}\`: **${val}**`)
      .join('\n') + '\n\n';
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

// ✅ Gera mensagem de comentário
let message = `## 📊 Design System Usage Report\n`;
message += `![Usage Badge](https://img.shields.io/badge/design--system--usage-${score}%25-blue?style=flat-square)\n`;
message += `**Framework detectado:** \`${framework}\`\n`;
message += `**Média de adoção geral:** **${score}%**\n\n`;

for (const [prefix, data] of Object.entries(systems)) {
  message += `---\n\n`;
  message += `## 🔹 Design System: \`${prefix}\`\n`;
  message += `**Adoção estimada:** ${data.score}%\n\n`;

  const total =
    count(data.components) +
    count(data.classes) +
    count(data.customProperties) +
    count(data.scssVariables) +
    count(data.directives);

  if (total > 0) {
    message += `- Total de usos detectados: **${total}**\n\n`;
    message += formatList('🧩 Componentes (tags)', data.components);
    message += formatList('🎨 Classes CSS', data.classes);
    message += formatList('🧪 CSS Custom Properties', data.customProperties);
    message += formatList('💠 SCSS Tokens', data.scssVariables);
    message += formatList('🔷 Diretivas Angular/Vue', data.directives);
    message += renderPropsMarkdown(data.propValues);
    message += formatList('🚫 Componentes fora do Design System', data.outsideComponents);
    message += renderInternalsMarkdown(data.internalComponents);
  } else {
    message += `❌ Nenhum uso detectado para este DS.`;
  }

  message += '\n';
}

// ✅ Publica comentário na PR
await octokit.issues.createComment({
  owner,
  repo,
  issue_number: parseInt(prNumber, 10),
  body: message
});

console.log('✅ Comentário publicado na PR.');
