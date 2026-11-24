import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../../src/docs/openapi.js';

// swagger-parser is a CommonJS package; createRequire avoids ESM default-import typing quirks
const require = createRequire(import.meta.url);
const SwaggerParser = require('@apidevtools/swagger-parser') as {
  validate: (api: object) => Promise<object>;
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const doc = JSON.parse(JSON.stringify(buildOpenApiDocument())) as Json;

const operations = Object.entries(doc.paths as Json).flatMap(([path, methods]) =>
  Object.entries(methods as Json).map(([method, op]) => ({
    key: `${method.toUpperCase()} ${path}`,
    path,
    op: op as Json,
  })),
);
const operation = (key: string) => operations.find((o) => o.key === key)!.op;
const requestBody = (key: string) => operation(key).requestBody.content['application/json'].schema as Json;
const parameter = (key: string, name: string) =>
  (operation(key).parameters as Json[]).find((p) => p.name === name)!;

// The whole API surface, in one readable list. Adding an endpoint means updating it.
const EXPECTED_OPERATIONS = [
  'GET /health',
  'POST /auth/register', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout', 'GET /auth/me',
  'POST /orgs', 'GET /orgs', 'GET /orgs/{orgId}', 'PATCH /orgs/{orgId}', 'DELETE /orgs/{orgId}',
  'GET /orgs/{orgId}/members', 'POST /orgs/{orgId}/members',
  'PATCH /orgs/{orgId}/members/{userId}', 'DELETE /orgs/{orgId}/members/{userId}',
  'POST /orgs/{orgId}/invitations', 'GET /orgs/{orgId}/invitations',
  'DELETE /orgs/{orgId}/invitations/{invitationId}', 'POST /invitations/accept',
  'GET /orgs/{orgId}/projects', 'POST /orgs/{orgId}/projects',
  'GET /orgs/{orgId}/projects/{projectId}', 'PATCH /orgs/{orgId}/projects/{projectId}',
  'DELETE /orgs/{orgId}/projects/{projectId}',
  'GET /orgs/{orgId}/tasks', 'POST /orgs/{orgId}/tasks',
  'GET /orgs/{orgId}/tasks/{taskId}', 'PATCH /orgs/{orgId}/tasks/{taskId}',
  'DELETE /orgs/{orgId}/tasks/{taskId}',
  'GET /orgs/{orgId}/tasks/{taskId}/comments', 'POST /orgs/{orgId}/tasks/{taskId}/comments',
  'DELETE /orgs/{orgId}/tasks/{taskId}/comments/{commentId}',
  'GET /orgs/{orgId}/audit-logs',
];
const PUBLIC_OPERATIONS = [
  'GET /health', 'POST /auth/register', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout',
];

describe('OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    expect(doc.openapi).toBe('3.1.0');
    await expect(SwaggerParser.validate(structuredClone(doc))).resolves.toBeDefined();
  });

  it('points at the API under APP_URL, with health at the root', () => {
    expect(doc.servers[0].url).toBe('https://app.example.test/api/v1'); // APP_URL from vitest.unit.config.ts
    expect(operation('GET /health').servers).toEqual([{ url: 'https://app.example.test' }]);
  });

  it('documents exactly the intended API surface', () => {
    expect(operations.map((o) => o.key).sort()).toEqual([...EXPECTED_OPERATIONS].sort());
  });

  it('gives every operation a unique id, a summary, and a declared tag', () => {
    const ids = operations.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);

    const tags = new Set((doc.tags as Json[]).map((t) => t.name));
    for (const { key, op } of operations) {
      expect(op.summary, key).toBeTruthy();
      expect(tags.has(op.tags[0]), key).toBe(true);
    }
  });
});

describe('security', () => {
  it('requires a bearer token on everything except the five public operations', () => {
    for (const { key, op } of operations) {
      const isPublic = PUBLIC_OPERATIONS.includes(key);
      expect(op.security, key).toEqual(isPublic ? [] : [{ bearerAuth: [] }]);
    }
  });

  it('states which permission each operation needs, and which roles hold it, from the real permission map', () => {
    expect(operation('DELETE /orgs/{orgId}').description).toContain('`org:delete` (OWNER)');
    expect(operation('GET /orgs/{orgId}/audit-logs').description).toContain('`audit:read` (ADMIN, OWNER)');
    expect(operation('POST /orgs/{orgId}/tasks').description).toContain('`task:write` (MEMBER, ADMIN, OWNER)');
    expect(operation('GET /orgs/{orgId}/tasks').description).toContain(
      '`task:read` (VIEWER, MEMBER, ADMIN, OWNER)',
    );
  });
});

describe('request schemas come from the Zod schemas that validate requests', () => {
  it('never offers OWNER as an invitation role, and treats role as optional', () => {
    const schema = requestBody('POST /orgs/{orgId}/invitations');
    expect(schema.properties.role.enum).toEqual(['ADMIN', 'MEMBER', 'VIEWER']);
    expect(schema.required).toEqual(['email']);
  });

  it('documents query defaults and limits', () => {
    expect(parameter('GET /orgs/{orgId}/tasks', 'limit')).toMatchObject({
      in: 'query',
      required: false,
      schema: { default: 20, maximum: 100 },
    });
    expect(parameter('GET /orgs/{orgId}/tasks', 'sortBy').schema.enum).toEqual([
      'createdAt', 'updatedAt', 'dueDate', 'priority',
    ]);
  });

  it('documents path parameters as required', () => {
    expect(parameter('GET /orgs/{orgId}/tasks/{taskId}', 'taskId')).toMatchObject({ in: 'path', required: true });
  });

  it('documents every {placeholder} in a path as a path parameter, and nothing extra', () => {
    for (const { key, path, op } of operations) {
      const placeholders = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const declared = ((op.parameters ?? []) as Json[]).filter((p) => p.in === 'path').map((p) => p.name).sort();
      expect(declared, key).toEqual(placeholders);
    }
  });

  it('documents dates as ISO date-time strings', () => {
    expect(JSON.stringify(requestBody('POST /orgs/{orgId}/tasks').properties.dueDate)).toContain(
      '"format":"date-time"',
    );
  });
});

describe('responses', () => {
  it('lists the errors each operation can really produce', () => {
    for (const { key, path, op } of operations) {
      const codes = Object.keys(op.responses);
      if (!PUBLIC_OPERATIONS.includes(key)) {
        expect(codes, key).toEqual(expect.arrayContaining(['401', '429']));
      }
      if (op.description.includes('Requires permission')) expect(codes, key).toContain('403');
      if (path.includes('{')) expect(codes, key).toContain('404');
    }
  });

  it('only refers to components that exist', () => {
    const refs = [...JSON.stringify(doc).matchAll(/#\/components\/(schemas|responses)\/(\w+)/g)];
    expect(refs.length).toBeGreaterThan(50);
    for (const [, kind, name] of refs) {
      expect(doc.components[kind][name], `${kind}/${name}`).toBeDefined();
    }
  });

  it('forbids undocumented fields in response models, so a leaked field is caught', () => {
    for (const name of ['User', 'Session', 'Task', 'Member', 'AuditLog']) {
      const schema = name === 'User' ? doc.components.schemas.Me.properties.user : doc.components.schemas[name];
      expect(schema.additionalProperties, name).toBe(false);
    }
  });

  it('leaves no JSON Schema dialect marker inside components', () => {
    expect(JSON.stringify(doc.components.schemas)).not.toContain('$schema');
  });
});