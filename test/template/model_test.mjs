/**
 * Test: the template model rebuilt from the OpenAPI output matches the parsed blocks
 */
import assert from 'assert';
import path from 'path';
import { createRequire } from 'module';
import { buildModel, buildEntries } from '../../template/src/model.mjs';

const require = createRequire(import.meta.url);

// Empty strings and undefined both mean absent
function stripUndefined (value) {
  return JSON.parse(JSON.stringify(value, (key, item) => item === '' ? undefined : item));
}

function rowsToFields (rows) {
  return rows.map(row => ({ field: row.field, type: row.type, optional: row.optional, description: row.description || '', defaultValue: row.defaultValue }));
}

function blockFields (fields) {
  return fields.map(field => ({
    field: field.field,
    type: field.type,
    optional: field.optional,
    description: field.description || '',
    defaultValue: field.defaultValue === undefined ? undefined : String(field.defaultValue),
  }));
}

describe('template model', function () {
  let api;
  let blocks;
  let project;
  let model;

  before(function () {
    this.timeout(20000);
    const apidoc = require('../../lib/index');
    api = apidoc.createDoc({ src: [path.resolve('example')], dryRun: true, silent: true });
    assert.notStrictEqual(typeof api, 'boolean');
    project = JSON.parse(api.project);
    // identical group, name and version pairs collapse to their first definition
    const seen = {};
    blocks = JSON.parse(api.data).filter(block => {
      const key = block.group + '/' + block.name + '/' + block.version;
      if (seen[key]) { return false; }
      seen[key] = true;
      return true;
    });
    model = buildModel(api.openapi.document, api.openapi.history, project);
  });

  it('should rebuild every parsed block as an entry', function () {
    const keys = {};
    blocks.forEach(block => { keys[block.group + '/' + block.name + '/' + block.version] = true; });
    const entryKeys = {};
    model.entries.forEach(entry => { entryKeys[entry.group + '/' + entry.name + '/' + entry.version] = true; });
    assert.deepStrictEqual(Object.keys(entryKeys).sort(), Object.keys(keys).sort());
  });

  it('should keep groups, titles, versions and order', function () {
    assert.deepStrictEqual(model.groups.map(group => group.name), ['User', 'City', 'Category_official', 'Warnings']);
    assert.strictEqual(model.groups[2].title, 'Category (official)');
    assert.deepStrictEqual(model.versions, ['0.3.0', '0.2.0', '0.1.0', '0.0.0']);
    const userNames = [];
    model.entries.forEach(entry => {
      if (entry.group === 'User' && userNames.indexOf(entry.name) === -1) { userNames.push(entry.name); }
    });
    assert.deepStrictEqual(userNames, ['PostUser', 'GetUser', 'PutUser', 'DeleteUser', 'ThankUser']);
  });

  it('should reproduce the field tables of each block', function () {
    blocks.forEach(block => {
      const entry = model.entries.filter(e => e.group === block.group && e.name === block.name && e.version === block.version)[0];
      assert.ok(entry, 'entry for ' + block.name + ' ' + block.version);
      const label = block.group + ' ' + block.name + ' ' + block.version;

      ['header', 'parameter', 'success', 'error'].forEach(section => {
        const expected = block[section] && block[section].fields ? block[section].fields : undefined;
        const actual = entry[section] && entry[section].fields ? entry[section].fields : undefined;
        if (!expected) {
          assert.strictEqual(actual, undefined, label + ' ' + section + ' should be empty');
          return;
        }
        assert.deepStrictEqual(Object.keys(actual), Object.keys(expected), label + ' ' + section + ' groups');
        Object.keys(expected).forEach(group => {
          assert.deepStrictEqual(stripUndefined(rowsToFields(actual[group])), stripUndefined(blockFields(expected[group])), label + ' ' + section + ' ' + group);
        });
      });

      ['query', 'body'].forEach(section => {
        if (!block[section]) {
          assert.strictEqual(entry[section], undefined, label + ' ' + section + ' should be empty');
          return;
        }
        assert.deepStrictEqual(stripUndefined(rowsToFields(entry[section])), stripUndefined(blockFields(block[section])), label + ' ' + section);
      });
    });
  });

  it('should reproduce examples, permissions, urls and sample requests', function () {
    blocks.forEach(block => {
      const entry = model.entries.filter(e => e.group === block.group && e.name === block.name && e.version === block.version)[0];
      const label = block.group + ' ' + block.name + ' ' + block.version;
      const titles = list => (list || []).map(example => example.title);
      assert.deepStrictEqual(titles(entry.examples), titles(block.examples), label + ' examples');
      ['header', 'parameter', 'success', 'error'].forEach(section => {
        assert.deepStrictEqual(titles(entry[section] && entry[section].examples), titles(block[section] && block[section].examples), label + ' ' + section + ' examples');
      });
      assert.deepStrictEqual(stripUndefined(entry.permission || null), stripUndefined(block.permission || null), label + ' permission');
      assert.strictEqual(entry.title, block.title, label + ' title');
      assert.strictEqual(entry.type, block.type.toLowerCase(), label + ' method');
      assert.strictEqual(entry.description || undefined, block.description, label + ' description');
      assert.strictEqual(entry.url, project.url + block.url.replace(/:(\w+)/g, '{$1}'), label + ' url');
      const expectedSample = block.sampleRequest ? block.sampleRequest[0].url.replace(/:(\w+)/g, '{$1}') : undefined;
      assert.strictEqual(entry.sampleRequest, expectedSample, label + ' sample request');
    });
  });

  it('should keep the authored status line and body of response examples', function () {
    const entry = model.entries.filter(e => e.name === 'DeleteUser' && e.version === '0.3.0')[0];
    assert.strictEqual(entry.success.examples[0].content, 'HTTP/1.1 200 OK\n{\n    "result": "ok"\n}');
    assert.strictEqual(entry.error.examples[0].content, 'HTTP/1.1 401 Not Authenticated\n{\n    "error": "NoAccessRight"\n}');
  });

  it('should render a plain OpenAPI document without apidoc extensions', function () {
    const spec = {
      openapi: '3.2.0',
      info: { title: 'Pets', version: '1.0.0' },
      servers: [{ url: 'https://pets.example' }],
      paths: {
        '/pets/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          get: {
            summary: 'Get a pet',
            responses: {
              200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
            },
          },
        },
      },
      components: { schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
    };
    const entries = buildEntries(spec, []);
    assert.strictEqual(entries.length, 1);
    const entry = entries[0];
    assert.strictEqual(entry.group, 'default');
    assert.strictEqual(entry.name, 'GetPetsId');
    assert.strictEqual(entry.version, '1.0.0');
    assert.strictEqual(entry.url, 'https://pets.example/pets/{id}');
    assert.strictEqual(entry.parameter.fields.Parameter[0].type, 'Integer');
    assert.strictEqual(entry.success.fields.OK[0].field, 'name');
    assert.strictEqual(entry.success.fields.OK[0].optional, false);
    assert.strictEqual(entry.sampleRequest, undefined);
  });
});
