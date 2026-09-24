/**
 * Test: schema helpers shared by the template
 */
import assert from 'assert';
import { schemaRows, bodySample, beautify, displayType, displaySize, parameterRows } from '../../template/src/schema.mjs';

describe('template schema helpers', function () {
  it('should rebuild apidoc type names from schemas', function () {
    assert.strictEqual(displayType({ type: 'string' }), 'String');
    assert.strictEqual(displayType({ type: 'array', items: { type: 'object' } }), 'Object[]');
    assert.strictEqual(displayType({ type: 'string', format: 'binary' }), 'File');
    assert.strictEqual(displayType({ type: 'string', format: 'date' }), 'Date');
    assert.strictEqual(displayType({ 'x-apidoc-type': 'Custom' }), 'Custom');
    assert.strictEqual(displayType({}), undefined);
    assert.strictEqual(displaySize({ type: 'string', minLength: 1, maxLength: 4 }), '1..4');
    assert.strictEqual(displaySize({ type: 'number', maximum: 5 }), '..5');
    assert.strictEqual(displaySize({ type: 'number', 'x-apidoc-size': '1-5', minimum: 1, maximum: 5 }), '1-5');
  });

  it('should flatten nested schemas into indented rows', function () {
    const schema = {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: {
          type: 'object',
          description: 'Profile',
          required: ['age'],
          properties: {
            age: { type: 'number' },
            image: { type: 'string' },
          },
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string', enum: ['a', 'b'], default: 'a' }, tags: { type: 'array', items: { type: 'string' } } },
          },
        },
      },
    };
    const rows = schemaRows(schema);
    assert.deepStrictEqual(rows.map(row => [row.field, row.key, row.depth, row.type, row.optional, row.bracket]), [
      ['profile', 'profile', 0, 'Object', false, 'profile'],
      ['profile.age', 'age', 1, 'Number', false, 'profile[age]'],
      ['profile.image', 'image', 1, 'String', true, 'profile[image]'],
      ['options', 'options', 0, 'Object[]', true, 'options[]'],
      ['options.name', 'name', 1, 'String', true, 'options[][name]'],
      ['options.tags', 'tags', 1, 'String[]', true, 'options[][tags]'],
    ]);
    assert.deepStrictEqual(rows[4].allowedValues, ['a', 'b']);
    assert.strictEqual(rows[4].defaultValue, 'a');
  });

  it('should turn a parameter into rows', function () {
    const rows = parameterRows({ name: 'id', in: 'path', required: true, description: 'The id', schema: { type: 'number', default: 3 } });
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual([rows[0].field, rows[0].type, rows[0].optional, rows[0].description, rows[0].defaultValue], ['id', 'Number', false, 'The id', '3']);
  });

  it('should convert properly a body schema to a json sample', function () {
    const schema = {
      type: 'object',
      properties: {
        aaa: { type: 'string', default: 'aaaDefault' },
        bbb: {
          type: 'object',
          properties: {
            some: { type: 'string', default: 'bbbsomedefault' },
            somebool: { type: 'boolean', default: true },
          },
        },
        ccc: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              some: { type: 'string', default: 'cccsomedefault' },
              somebool: { type: 'boolean', default: true },
            },
          },
        },
        A: {
          type: 'object',
          properties: {
            b: { type: 'number' },
            c: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  b: { type: 'string' },
                  c: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        a: { type: 'string' },
                        b: { type: 'array', items: { type: 'number' } },
                        c: { type: 'array', items: { type: 'object', properties: { b: { type: 'string' } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        avatar: { type: 'string', format: 'binary' },
      },
    };

    const fixture = {
      aaa: 'aaaDefault',
      bbb: { some: 'bbbsomedefault', somebool: true },
      ccc: [{ some: 'cccsomedefault', somebool: true }],
      A: {
        b: 0,
        c: [{
          b: '',
          c: [{ a: '', b: [], c: [{ b: '' }] }],
        }],
      },
    };

    assert.strictEqual(bodySample(schema), beautify(fixture));
  });

  it('should unwrap a lone optional list body', function () {
    const schema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' } } } } } };
    assert.strictEqual(bodySample(schema), beautify([{ id: 0 }]));
  });
});
