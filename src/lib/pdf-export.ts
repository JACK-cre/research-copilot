import 'server-only';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildResearchDocx } from '@/lib/docx-export';
import type { ResearchResult } from '@/types/research';

const execFileAsync = promisify(execFile);

function sofficeCommand(): string {
  return process.env.SOFFICE_PATH?.trim() || 'soffice';
}

export async function buildResearchPdf(result: ResearchResult): Promise<Uint8Array> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'research-copilot-pdf-'));
  const input = path.join(directory, 'research-report.docx');
  try {
    await writeFile(input, await buildResearchDocx(result));
    await execFileAsync(sofficeCommand(), [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', directory,
      input,
    ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    return new Uint8Array(await readFile(path.join(directory, 'research-report.pdf')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found|找不到/i.test(message)) {
      throw new Error('服务器尚未安装 LibreOffice，暂时无法导出 PDF。请在运行环境安装 libreoffice，或设置 SOFFICE_PATH。');
    }
    throw new Error(`PDF 导出失败：${message.slice(0, 500)}`);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
