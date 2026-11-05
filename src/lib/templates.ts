import 'server-only';

import { randomUUID } from 'node:crypto';

import { removeStoredObjects, uploadTemplateFile } from '@/lib/cloud-storage';
import { getDatabasePool } from '@/lib/db';
import type {
  DataScope,
  OutputTemplate,
  OutputTemplateSnapshot,
  TemplateKind,
} from '@/types/platform';

export const DEFAULT_OUTPUT_TEMPLATES: OutputTemplate[] = [
  {
    id: 'default-academic-paper',
    name: '通用学术论文',
    kind: 'both',
    description: '适合课程论文、研究综述和通用学术汇报',
    citationStyle: 'GB/T 7714-2015',
    instructions: '论文依次包含题目、摘要、关键词、引言、相关研究、方法或分析框架、证据讨论、局限性、结论与参考文献。摘要应独立完整，正文使用分级标题，论断必须绑定证据编号。PPT 使用问题、证据、判断、方案、结论的叙事顺序。',
    isDefault: true,
  },
  {
    id: 'default-graduation-thesis',
    name: '毕业论文',
    kind: 'report',
    description: '适合本科或硕士毕业论文初稿',
    citationStyle: 'GB/T 7714-2015',
    instructions: '论文包含中文摘要、关键词、研究背景与意义、国内外研究现状、研究问题、方法设计、分析结果、讨论、结论与展望、参考文献。章节编号采用 1、1.1、1.1.1，避免把未经验证的内容写成实验结论。学校的具体页边距、字体、封面和页眉页脚要求以用户补充说明为准。',
    isDefault: true,
  },
  {
    id: 'default-technical-report',
    name: '技术调研报告',
    kind: 'both',
    description: '适合方案选型、架构评审和研发汇报',
    citationStyle: 'IEEE',
    instructions: '报告包含执行摘要、问题与约束、技术版图、候选方案对比、关键证据、推荐架构、实施路线、风险与评估指标。PPT 优先使用对比、证据和路线图页面，结论必须可执行。',
    isDefault: true,
  },
  {
    id: 'default-defense',
    name: '论文答辩汇报',
    kind: 'presentation',
    description: '适合开题、中期和毕业答辩',
    citationStyle: 'GB/T 7714-2015',
    instructions: 'PPT 依次呈现研究背景、问题、相关工作、方法、证据或实验、贡献、局限和下一步。页数按用户要求确定；未指定时 8 至 16 页。每页只保留一个中心观点，讲稿补充解释而不是重复页面文字。论文部分保留可追溯的简明提纲。',
    isDefault: true,
  },
];

interface TemplateRow {
  id: string;
  name: string;
  kind: TemplateKind;
  description: string;
  school: string;
  citation_style: string;
  instructions: string;
  paper_source_name: string;
  paper_storage_path: string;
  slides_source_name: string;
  slides_storage_path: string;
  created_at: Date;
}

function mapTemplate(row: TemplateRow): OutputTemplate {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    school: row.school || undefined,
    citationStyle: row.citation_style,
    instructions: row.instructions,
    isDefault: false,
    createdAt: row.created_at.toISOString(),
    paperSourceName: row.paper_source_name || undefined,
    slidesSourceName: row.slides_source_name || undefined,
  };
}

const TEMPLATE_COLUMNS = `id, name, kind, description, school, citation_style, instructions,
       COALESCE(paper_source_name, '') AS paper_source_name,
       COALESCE(paper_storage_path, '') AS paper_storage_path,
       COALESCE(slides_source_name, '') AS slides_source_name,
       COALESCE(slides_storage_path, '') AS slides_storage_path,
       created_at`;

export async function listOutputTemplates(scope: DataScope): Promise<OutputTemplate[]> {
  if (scope.mode === 'legacy') return DEFAULT_OUTPUT_TEMPLATES;
  const result = await getDatabasePool().query<TemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS}
     FROM output_templates WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [scope.workspaceId],
  );
  return [...DEFAULT_OUTPUT_TEMPLATES, ...result.rows.map(mapTemplate)];
}

export async function resolveOutputTemplate(
  scope: DataScope,
  id?: string,
): Promise<OutputTemplateSnapshot | undefined> {
  if (!id) return undefined;
  const defaultTemplate = DEFAULT_OUTPUT_TEMPLATES.find((template) => template.id === id);
  if (defaultTemplate) {
    const { createdAt: _createdAt, ...snapshot } = defaultTemplate;
    return snapshot;
  }
  if (scope.mode === 'legacy') throw new Error('所选输出模板不存在。');
  const result = await getDatabasePool().query<TemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS}
     FROM output_templates WHERE id = $1 AND workspace_id = $2`,
    [id, scope.workspaceId],
  );
  if (!result.rows[0]) throw new Error('所选输出模板不存在。');
  const { createdAt: _createdAt, ...snapshot } = mapTemplate(result.rows[0]);
  return snapshot;
}

async function storeTemplateFiles(
  scope: DataScope,
  templateId: string,
  files: { paper?: File; slides?: File },
  previous?: { paper_storage_path: string; slides_storage_path: string; paper_source_name: string; slides_source_name: string },
): Promise<{ paperName: string; paperPath: string; slidesName: string; slidesPath: string }> {
  let paperName = previous?.paper_source_name ?? '';
  let paperPath = previous?.paper_storage_path ?? '';
  let slidesName = previous?.slides_source_name ?? '';
  let slidesPath = previous?.slides_storage_path ?? '';
  const obsolete: string[] = [];

  if (files.paper && files.paper.size > 0) {
    if (paperPath) obsolete.push(paperPath);
    paperPath = await uploadTemplateFile(scope, templateId, 'paper', files.paper);
    paperName = files.paper.name;
  }
  if (files.slides && files.slides.size > 0) {
    if (slidesPath) obsolete.push(slidesPath);
    slidesPath = await uploadTemplateFile(scope, templateId, 'slides', files.slides);
    slidesName = files.slides.name;
  }
  if (obsolete.length) await removeStoredObjects(scope, obsolete).catch(() => undefined);
  return { paperName, paperPath, slidesName, slidesPath };
}

export async function createOutputTemplate(scope: DataScope, input: {
  name: string;
  kind: TemplateKind;
  description: string;
  school?: string;
  citationStyle?: string;
  instructions: string;
  paperFile?: File;
  slidesFile?: File;
}): Promise<OutputTemplate> {
  if (scope.mode !== 'cloud') throw new Error('自定义模板仅在私有云模式可用。');
  const id = randomUUID();
  const stored = await storeTemplateFiles(scope, id, { paper: input.paperFile, slides: input.slidesFile });
  const result = await getDatabasePool().query<TemplateRow>(
    `INSERT INTO output_templates
       (id, workspace_id, created_by, name, kind, description, school, citation_style, instructions,
        paper_source_name, paper_storage_path, slides_source_name, slides_storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${TEMPLATE_COLUMNS}`,
    [
      id,
      scope.workspaceId,
      scope.userId,
      input.name,
      input.kind,
      input.description,
      input.school ?? '',
      input.citationStyle ?? '按模板规则',
      input.instructions,
      stored.paperName,
      stored.paperPath,
      stored.slidesName,
      stored.slidesPath,
    ],
  );
  return mapTemplate(result.rows[0]);
}

export async function updateOutputTemplate(scope: DataScope, id: string, input: {
  name: string;
  kind: TemplateKind;
  description: string;
  instructions: string;
  paperFile?: File;
  slidesFile?: File;
}): Promise<OutputTemplate | null> {
  if (scope.mode !== 'cloud') throw new Error('自定义模板仅在私有云模式可用。');
  const existing = await getDatabasePool().query<TemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS} FROM output_templates WHERE id = $1 AND workspace_id = $2 AND created_by = $3`,
    [id, scope.workspaceId, scope.userId],
  );
  if (!existing.rows[0]) return null;
  const stored = await storeTemplateFiles(scope, id, { paper: input.paperFile, slides: input.slidesFile }, existing.rows[0]);
  const result = await getDatabasePool().query<TemplateRow>(
    `UPDATE output_templates
     SET name = $1, kind = $2, description = $3, instructions = $4,
         paper_source_name = $5, paper_storage_path = $6, slides_source_name = $7, slides_storage_path = $8
     WHERE id = $9 AND workspace_id = $10 AND created_by = $11
     RETURNING ${TEMPLATE_COLUMNS}`,
    [
      input.name,
      input.kind,
      input.description,
      input.instructions,
      stored.paperName,
      stored.paperPath,
      stored.slidesName,
      stored.slidesPath,
      id,
      scope.workspaceId,
      scope.userId,
    ],
  );
  return result.rows[0] ? mapTemplate(result.rows[0]) : null;
}

export async function deleteOutputTemplate(scope: DataScope, id: string): Promise<boolean> {
  if (scope.mode !== 'cloud') return false;
  const existing = await getDatabasePool().query<TemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS} FROM output_templates WHERE id = $1 AND workspace_id = $2 AND created_by = $3`,
    [id, scope.workspaceId, scope.userId],
  );
  const result = await getDatabasePool().query(
    'DELETE FROM output_templates WHERE id = $1 AND workspace_id = $2 AND created_by = $3',
    [id, scope.workspaceId, scope.userId],
  );
  if (existing.rows[0]) {
    const keys = [existing.rows[0].paper_storage_path, existing.rows[0].slides_storage_path].filter(Boolean);
    if (keys.length) await removeStoredObjects(scope, keys).catch(() => undefined);
  }
  return Boolean(result.rowCount);
}
