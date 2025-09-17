import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ALLOWED_FRAME_ANCESTORS = [
  "'self'",
  'https://claude.ai',
  'https://chatgpt.com',
  'https://chat.openai.com',
];

function updateContentSecurityPolicy(existing: string | null): string {
  const directive = `frame-ancestors ${ALLOWED_FRAME_ANCESTORS.join(' ')}`;
  if (!existing) {
    return directive;
  }
  const parts = existing
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  let replaced = false;
  const updated = parts.map((segment) => {
    if (segment.toLowerCase().startsWith('frame-ancestors')) {
      replaced = true;
      return directive;
    }
    return segment;
  });

  if (!replaced) {
    updated.push(directive);
  }

  return updated.join('; ');
}

export function middleware(_req: NextRequest) {
  const response = NextResponse.next();
  response.headers.delete('x-frame-options');

  const existingCsp = response.headers.get('content-security-policy');
  response.headers.set('content-security-policy', updateContentSecurityPolicy(existingCsp));

  return response;
}

export const config = {
  matcher: ['/connector/auth'],
};
