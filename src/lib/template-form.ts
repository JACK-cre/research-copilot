import { z } from 'zod';

import type { TemplateKind } from '@/types/platform';

export const templateFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['report', 'presentation', 'both']),
  description: z.string().trim().max(4000).default(''),
  instructions: z.string().trim().min(8).max(100000),
});

export interface TemplateFormPayload {
  name: string;
  kind: TemplateKind;
  description: string;
  instructions: string;
  paperFile?: File;
  slidesFile?: File;
}

function asFile(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File && value.size > 0 ? value : undefined;
}

export async function readTemplatePayload(request: Request): Promise<TemplateFormPayload> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const parsed = templateFieldsSchema.parse({
      name: String(form.get('name') || ''),
      kind: String(form.get('kind') || 'both'),
      description: String(form.get('description') || ''),
      instructions: String(form.get('instructions') || ''),
    });
    return {
      ...parsed,
      paperFile: asFile(form.get('paper')),
      slidesFile: asFile(form.get('slides')),
    };
  }

  const parsed = templateFieldsSchema.parse(await request.json());
  return parsed;
}
