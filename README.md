# openapidoc

openapidoc creates documentation from API descriptions in your source code and emits it as
an OpenAPI 3.2 document plus a static HTML viewer rendered from that document.

It is a maintained fork of [apidoc](https://github.com/apidoc/apidoc) and a drop in
replacement for it. The executable is still called `apidoc`, every command line option is
unchanged and the `@api*` comment syntax is exactly the same.

## Installation

```bash
$ npm install -g openapidoc
```

## Usage

Add some apidoc comments anywhere in your source code:

```java
/**
 * @api {get} /user/:id Request User information
 * @apiName GetUser
 * @apiGroup User
 *
 * @apiParam {Number} id User's unique ID.
 *
 * @apiSuccess {String} firstname Firstname of the User.
 * @apiSuccess {String} lastname  Lastname of the User.
 */
```

Now generate the documentation from `src/` into `doc/`.

```bash
$ apidoc -i src/ -o doc/
```

The output directory contains:

| File | Content |
|---|---|
| `index.html` | the documentation page |
| `assets/openapi.json` | the OpenAPI 3.2 document for the project version |
| `assets/openapi.<version>.json` | one document per documented version, when there is more than one |
| `assets/api-data.json` | the classic parsed data, only with `--write-json` |
| `assets/main.bundle.js` | the viewer, built with webpack at generation time |

This repository contains an `example` folder from which you can generate a very complete
documentation for an example api. It also contains best practice hints in `footer.md`.

```bash
$ git clone https://github.com/nickheyer/openapidoc && cd openapidoc
$ npm install --omit=dev
$ ./bin/apidoc -i example -o /tmp/doc
$ $BROWSER /tmp/doc
```

Run `apidoc --help` for the full list of options. They are the same as apidoc 1.x.

## OpenAPI output

Everything that has a home in OpenAPI 3.2 is emitted as standard OpenAPI. The viewer reads
only that document, so the same file works in any other OpenAPI tool.

| apidoc | OpenAPI |
|---|---|
| `@api {method} /path/:id title` | `paths./path/{id}.<method>` with `summary` |
| `@apiName`, `@apiGroup` | `operationId`, `tags` and a Tag Object with `summary` |
| `@apiDescription`, `@apiDeprecated` | `description`, `deprecated` |
| `@apiParam`, `@apiQuery`, `@apiHeader` | `parameters` with `in` path, query or header |
| `@apiBody` | `requestBody` with a JSON Schema built from the dot notation fields |
| `@apiSuccess (Success 200)`, `@apiError (Error 4xx)` | `responses.200`, `responses.4XX` |
| `@apiSuccessExample`, `@apiErrorExample` | `responses.<code>.content.<media>.examples` |
| `@apiExample` | `x-codeSamples` |
| `@apiSampleRequest` | `x-apidoc-sample-request` |
| `@apiVersion` | one document per version, `x-apidoc-version` on each operation |
| project `name`, `description`, `url`, `sampleUrl` | `info.title`, `info.summary`, `servers` |
| `header.md`, `footer.md` | `info.description`, `x-apidoc-footer` |

Information without an OpenAPI equivalent is kept in `x-apidoc-*` extensions:

| Extension | Where | Meaning |
|---|---|---|
| `x-apidoc-version` | operation | the `@apiVersion` of the block |
| `x-apidoc-permission` | operation | resolved `@apiPermission` entries |
| `x-apidoc-sample-request` | operation | a full try it URL, or `false` when disabled |
| `x-apidoc-sample-request` | server | marks the server used for sample requests |
| `x-apidoc-deprecated` | operation | the text given with `@apiDeprecated` |
| `x-apidoc-group` | parameter, property | a custom `(group)` heading |
| `x-apidoc-optional` | path parameter | the author marked a path parameter optional |
| `x-apidoc-type`, `x-apidoc-size` | schema | the authored type or size when it cannot be rebuilt |
| `x-apidoc-status-line` | example | the authored `HTTP/1.1 200 OK` line of a response example |
| `x-apidoc-section` | code sample | `header` or `parameter` for `@apiHeaderExample` and `@apiParamExample` |
| `x-apidoc-header`, `x-apidoc-footer` | document | titles and footer content from the config |
| `x-internal` | operation | the block was marked `@apiPrivate` |

### Versions

OpenAPI documents have a single version, apidoc versions every endpoint. openapidoc writes one
document per version. Each contains, for every endpoint, its newest definition at or below that
version, which is what the version dropdown of the viewer shows.

## Programmatic usage

```ts
import path from 'path'
import { createDoc } from 'openapidoc'

const doc = createDoc({
  src: path.resolve(__dirname, 'src'),
  dest: path.resolve(__dirname, 'doc'), // can be omitted if dryRun is true
  dryRun: true, // do not write output files
  silent: true, // no log output
})

if (typeof doc !== 'boolean') {
  console.log(doc.data) // the parsed api documentation as a JSON string
  console.log(doc.project) // the project information as a JSON string
  console.log(doc.openapi.document) // the OpenAPI document of the project version
  console.log(doc.openapi.documents) // every version, keyed by version
}
```

## Docker image

```bash
docker build -t openapidoc .
docker run --rm -v $(pwd):/home/node/apidoc openapidoc -o outputdir -i inputdir
```

## Supported programming languages

 * **C#, Go, Dart, Java, JavaScript, PHP, Scala** (all DocStyle capable languages):

   ```javascript
   /**
     * This is a comment.
     */
   ```

 * **Clojure**:

   ```clojure
   ;;;;
   ;; This is a comment.
   ;;;;
   ```

 * **CoffeeScript**:

   ```coffeescript
   ###
   This is a comment.
   ###
   ```

 * **Elixir**:

   ```elixir
   #{
   # This is a comment.
   #}
   ```

 * **Erlang**:

   ```erlang
   %{
   % This is a comment.
   %}
   ```

 * **Perl**

   ```perl
   #**
   # This is a comment.
   #*
   ```

   ```perl
   =pod
   This is a comment.
   =cut
   ```

 * **Python**

   ```python
   """
   This is a comment.
   """
   ```

 * **Ruby**

   ```ruby
   =begin
   This is a comment.
   =end
   ```

## Plugins

Installed apidoc plugins are picked up automatically, the parser is unchanged.

 * [apidoc-plugin-schema](https://github.com/willfarrell/apidoc-plugin-schema) generates apidoc elements from api schemas. `npm install apidoc-plugin-schema`

For details on how to implement your own plugin, see [apidoc-plugin-test](https://github.com/apidoc/apidoc-plugin-test).

## Support

Please [create a new issue](https://github.com/nickheyer/openapidoc/issues/new/choose) if you have a suggestion or found a problem.

## Contributing

Pull requests are welcome. Please see the [CONTRIBUTING](https://github.com/nickheyer/openapidoc/blob/master/CONTRIBUTING.md) file.
