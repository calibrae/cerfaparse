import { execa } from 'execa';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function checkPoppler(): Promise<void> {
  const tools = ['pdftocairo', 'pdftotext', 'pdfinfo'];
  const missing: string[] = [];

  for (const tool of tools) {
    try {
      await execa(tool, ['-v']);
    } catch {
      missing.push(tool);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Poppler tools not found: ${missing.join(', ')}. Install with:\n` +
        '  macOS:  brew install poppler\n' +
        '  Linux:  apt install poppler-utils',
    );
  }
}

export async function getPageCount(pdfPath: string): Promise<number> {
  await validateFileExists(pdfPath);
  const { stdout } = await execa('pdfinfo', [pdfPath]);
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error('Could not determine page count from pdfinfo');
  return parseInt(match[1], 10);
}

export async function extractSvg(
  pdfPath: string,
  page: number,
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cerfaparse-'));
  const outPath = join(tmpDir, `page-${page}.svg`);
  try {
    await execa('pdftocairo', [
      '-svg',
      '-f',
      String(page),
      '-l',
      String(page),
      pdfPath,
      outPath,
    ]);
    return await readFile(outPath, 'utf-8');
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — don't mask the original error
    }
  }
}

export async function extractBbox(pdfPath: string): Promise<string> {
  const { stdout } = await execa('pdftotext', [
    '-bbox-layout',
    pdfPath,
    '-',
  ]);
  return stdout;
}

async function validateFileExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`File not found: ${path}`);
  }
}
