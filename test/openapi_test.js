/**
 * Test: OpenAPI output built from the example project
 */
const assert = require('assert');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const apidoc = require('../lib/index');
// Ajv resolves the dialect $dynamicRef against the wrong scope, bind it statically
const oasSchema = JSON.parse(JSON.stringify(require('./openapi/oas-3.2-schema.json'))
  .split('"$dynamicRef":"#meta"').join('"$ref":"#/$defs/schema"'));

describe('openapi output', function () {
  let api;
  let doc;

  before(function () {
    this.timeout(20000);
    api = apidoc.createDoc({
      src: [path.join(__dirname, '..', 'example')],
      dryRun: true,
      silent: true,
    });
    assert.notStrictEqual(typeof api, 'boolean', 'example must parse');
    doc = api.openapi.document;
  });

  it('should build one document per known version', function () {
    assert.deepStrictEqual(api.openapi.versions, ['0.3.0', '0.2.0', '0.1.0', '0.0.0']);
    assert.strictEqual(api.openapi.version, '0.3.0');
    assert.deepStrictEqual(Object.keys(api.openapi.documents).sort(), ['0.0.0', '0.1.0', '0.2.0', '0.3.0']);
    assert.strictEqual(api.openapi.documents['0.3.0'], doc);
    assert.strictEqual(doc.openapi, '3.2.0');
    assert.strictEqual(doc.info.version, '0.3.0');
    assert.strictEqual(api.openapi.documents['0.1.0'].info.version, '0.1.0');
  });

  it('should validate every document against the OAS 3.2 schema', function () {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addFormat('media-range', true);
    const validate = ajv.compile(oasSchema);
    Object.keys(api.openapi.documents).forEach(version => {
      const ok = validate(api.openapi.documents[version]);
      assert.ok(ok, `document ${version} is invalid: ${JSON.stringify(validate.errors, null, 2)}`);
    });
  });

  it('should carry project info, servers and ordered tags', function () {
    assert.strictEqual(doc.info.title, 'AcmeCorp Api documentation');
    assert.strictEqual(doc.info.summary, 'Documentation for the REST api access provided at AcmeCorp');
    assert.ok(doc.info.description.indexOf('<h1>Introduction</h1>') !== -1);
    assert.deepStrictEqual(doc.servers[0], { url: 'https://api.example.com' });
    assert.strictEqual(doc.servers[1].url, 'https://apidoc.free.beeceptor.com');
    assert.strictEqual(doc.servers[1]['x-apidoc-sample-request'], true);
    assert.deepStrictEqual(doc.tags.map(tag => tag.name), ['User', 'City', 'Category_official', 'Warnings']);
    assert.strictEqual(doc.tags[2].summary, 'Category (official)');
    assert.strictEqual(doc['x-apidoc-header'].title, 'Introduction');
    assert.strictEqual(doc['x-apidoc-footer'].title, 'Best practices');
    assert.ok(doc['x-apidoc-footer'].content.indexOf('<h1>Best practices</h1>') !== -1);
  });

  it('should convert urls to path templates with typed parameters', function () {
    const op = doc.paths['/user/{region}/{id}/{opt}'].get;
    assert.strictEqual(op.operationId, 'GetUser');
    assert.strictEqual(op.summary, 'Read data of a User');
    assert.deepStrictEqual(op.tags, ['User']);
    assert.strictEqual(op['x-apidoc-version'], '0.3.0');
    const byName = {};
    op.parameters.forEach(p => { byName[p.name] = p; });
    assert.deepStrictEqual(byName.id, { name: 'id', in: 'path', description: '<p>User unique ID</p>', required: true, schema: { type: 'number' } });
    assert.strictEqual(byName.region.schema.default, 'fr-par');
    assert.strictEqual(byName.opt.required, true);
    assert.strictEqual(byName.opt['x-apidoc-optional'], true);
    assert.strictEqual(byName.region['x-apidoc-optional'], undefined);
    assert.strictEqual(byName.Authorization.in, 'header');
    assert.strictEqual(byName['X-Apidoc-Cool-Factor'].schema.default, 'big');
    assert.deepStrictEqual(op['x-apidoc-permission'], [{ name: 'admin:computer', title: 'User access only', description: '<p>This optional description belong to to the group admin.</p>' }]);
  });

  it('should map query parameters and request bodies', function () {
    const op = doc.paths['/city'].post;
    const view = op.parameters.find(p => p.name === 'view');
    assert.strictEqual(view.in, 'query');
    assert.strictEqual(view.required, true);
    assert.deepStrictEqual(view.schema.enum, ['Aerial', 'Land', 'Underwater']);
    assert.strictEqual(view.schema.default, 'Aerial');
    assert.strictEqual(view['x-apidoc-group'], undefined);
    const body = op.requestBody.content['application/json'].schema;
    assert.strictEqual(body.properties.name.default, 'Paris');
    assert.deepStrictEqual(body.required, ['name']);
    assert.strictEqual(op.requestBody.required, true);
  });

  it('should nest dot notation fields and detect file uploads', function () {
    const body = doc.paths['/user'].post.requestBody.content['application/json'].schema;
    const extra = body.properties.extraInfo;
    assert.strictEqual(extra.type, 'object');
    assert.strictEqual(extra.properties.hireDateWithDefault.default, '2021-09-01');
    assert.strictEqual(extra.properties.isVegan.default, true);
    assert.deepStrictEqual(extra.properties.nicknames, { type: 'array', items: { type: 'string' }, description: '<p>List of Users nicknames (Array of Strings)</p>' });
    const deep = extra.properties.secrets.properties.deepSecrets;
    assert.strictEqual(deep.type, 'array');
    assert.ok(deep.items.properties['name.particle']);
    assert.ok(body.properties['custom.property']);
    assert.strictEqual(extra.properties.secrets.properties.hair.default, 1000);

    const put = doc.paths['/user/{id}'].put.requestBody;
    assert.ok(put.content['multipart/form-data']);
    assert.strictEqual(put.content['multipart/form-data'].schema.properties.avatar.format, 'binary');
  });

  it('should map success and error groups to responses with examples', function () {
    const op = doc.paths['/user/{id}'].delete;
    const ok = op.responses['200'];
    assert.strictEqual(ok.description, 'Success 200');
    const schema = ok.content['application/json'].schema;
    assert.strictEqual(schema.properties.result.type, 'string');
    assert.deepStrictEqual(schema.required, ['result']);
    assert.ok(schema.properties.nullableField);
    const example = ok.content['application/json'].examples['Success-Example'];
    assert.deepStrictEqual(example.value, { result: 'ok' });
    assert.strictEqual(example['x-apidoc-status-line'], 'HTTP/1.1 200 OK');

    assert.strictEqual(op.responses['4XX'].description, 'Error 4xx');
    assert.ok(op.responses['4XX'].content['application/json'].schema.properties.NoAccessRight);
    assert.strictEqual(op.responses['500'].description, '500 Internal Server Error');
    const unauthorized = op.responses['401'];
    assert.strictEqual(unauthorized.description, 'Not Authenticated');
    assert.deepStrictEqual(unauthorized.content['application/json'].examples['Response (example):'].value, { error: 'NoAccessRight' });
  });

  it('should keep code examples as x-codeSamples', function () {
    const op = doc.paths['/user/{region}/{id}/{opt}'].get;
    const samples = op['x-codeSamples'];
    assert.deepStrictEqual(samples.map(s => s.lang), ['bash', 'js', 'python', 'Header']);
    assert.strictEqual(samples[0].label, 'Curl example');
    assert.strictEqual(samples[3]['x-apidoc-section'], 'header');
    const del = doc.paths['/category'].delete['x-codeSamples'];
    assert.strictEqual(del[0]['x-apidoc-section'], 'parameter');
    assert.strictEqual(del[0].lang, 'json');
  });

  it('should record sample request overrides and opt outs', function () {
    assert.strictEqual(doc.paths['/category'].get['x-apidoc-sample-request'], 'http://www.example.com');
    assert.strictEqual(doc.paths['/category'].delete['x-apidoc-sample-request'], false);
    assert.strictEqual(doc.paths['/user/{id}'].post['x-apidoc-sample-request'], false);
    assert.strictEqual(doc.paths['/user/{id}'].delete['x-apidoc-sample-request'], undefined);
  });

  it('should keep the newest definition per version and older ones in history', function () {
    const v2 = api.openapi.documents['0.2.0'];
    assert.strictEqual(v2.paths['/user/{id}'].get['x-apidoc-version'], '0.2.0');
    assert.strictEqual(v2.paths['/user/{region}/{id}/{opt}'], undefined);
    const v1 = api.openapi.documents['0.1.0'];
    assert.strictEqual(v1.paths['/user/{id}'].get['x-apidoc-version'], '0.1.0');
    const versions = api.openapi.history
      .filter(entry => entry.operation.operationId === 'GetUser')
      .map(entry => entry.operation['x-apidoc-version'])
      .sort();
    assert.deepStrictEqual(versions, ['0.1.0', '0.2.0']);
    api.openapi.history.forEach(entry => {
      assert.ok(entry.path && entry.method && entry.operation);
    });
  });

  it('should keep legacy programmatic output unchanged', function () {
    assert.strictEqual(typeof api.data, 'string');
    assert.strictEqual(typeof api.project, 'string');
    assert.ok(Array.isArray(JSON.parse(api.data)));
  });
});
