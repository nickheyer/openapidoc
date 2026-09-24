/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Authors:
 * Nicholas Heyer <nick@heyer.app>
 * Licensed under the MIT license.
 */
const os = require('os');

/**
 * Write output files
 */
class Writer {
  constructor (api, app, cacheBustingQueryParam = `v=${Date.now()}`) {
    this.api = api;
    this.log = app.log;
    this.opt = app.options;
    this.cacheBustingQueryParam = String(cacheBustingQueryParam);
    this.fs = require('fs-extra');
    this.path = require('path');
  }

  // The public method
  write () {
    if (this.opt.dryRun) {
      this.log.info('Dry run mode enabled: no files created.');
      return new Promise((resolve, reject) => { return resolve(); });
    }

    this.log.verbose('Writing files...');
    if (this.opt.single) {
      return this.createSingleFile();
    }
    return this.createOutputFiles();
  }

  /**
   * Find assets from node_modules folder and return its path
   * Argument is the path relative to node_modules folder
   */
  findAsset (assetPath) {
    try {
      const path = require.resolve(assetPath);
      return path;
    } catch {
      this.log.error('Could not find where dependencies of apidoc live!');
    }
  }

  createOutputFiles () {
    this.createDir(this.opt.dest);

    // create index.html
    this.log.verbose('Copying template index.html to: ' + this.opt.dest);
    this.fs.writeFileSync(this.path.join(this.opt.dest, 'index.html'), this.getIndexContent());

    // create assets folder
    const assetsPath = this.path.resolve(this.path.join(this.opt.dest + 'assets'));
    this.createDir(assetsPath);

    // add the fonts
    this.log.verbose('Copying fonts to: ' + assetsPath);
    this.fs.copySync(this.path.join(this.opt.template, 'fonts'), assetsPath);

    // save the parsed api file
    if (this.opt.writeJson) {
      const jsonFile = this.path.join(assetsPath, 'api-data.json');
      this.log.verbose('Saving parsed API to: ' + jsonFile);
      this.fs.writeFileSync(jsonFile, this.api.data);
    }

    this.writeOpenApi(assetsPath);

    // CSS from dependencies
    this.log.verbose('Copying bootstrap css to: ' + assetsPath);
    this.fs.copySync(this.findAsset('bootstrap/dist/css/bootstrap.min.css'), this.path.join(assetsPath, 'bootstrap.min.css'));
    this.fs.copySync(this.findAsset('bootstrap/dist/css/bootstrap.min.css.map'), this.path.join(assetsPath, 'bootstrap.min.css.map'));
    this.log.verbose('Copying prism css to: ' + assetsPath);
    this.fs.copySync(this.findAsset('prismjs/themes/prism-tomorrow.css'), this.path.join(assetsPath, 'prism.css'));
    this.fs.copySync(this.findAsset('prismjs/plugins/toolbar/prism-toolbar.css'), this.path.join(assetsPath, 'prism-toolbar.css'));
    this.fs.copySync(this.findAsset('prismjs/plugins/diff-highlight/prism-diff-highlight.css'), this.path.join(assetsPath, 'prism-diff-highlight.css'));
    this.log.verbose('Copying main css to: ' + assetsPath);
    // main.css
    this.fs.copySync(this.path.join(this.opt.template, 'src', 'css', 'main.css'), this.path.join(assetsPath, 'main.css'));
    // images
    this.fs.copySync(this.path.join(this.opt.template, 'img'), assetsPath);

    return this.runWebpack(this.path.resolve(assetsPath));
  }

  // One portable document per version next to the main one
  writeOpenApi (assetsPath) {
    const openapi = this.api.openapi;
    if (!openapi || !openapi.document) { return; }
    const mainFile = this.path.join(assetsPath, 'openapi.json');
    this.log.verbose('Saving OpenAPI document to: ' + mainFile);
    this.fs.writeFileSync(mainFile, this.serialize(openapi.document));
    if (openapi.versions.length > 1) {
      openapi.versions.forEach(version => {
        const file = this.path.join(assetsPath, `openapi.${version}.json`);
        this.log.verbose('Saving OpenAPI document to: ' + file);
        this.fs.writeFileSync(file, this.serialize(openapi.documents[version]));
      });
    }
  }

  serialize (value) {
    const lineEnding = this.opt.lineEnding || '\n';
    return JSON.stringify(value, null, 2).replace(/(\r\n|\n|\r)/g, lineEnding) + lineEnding;
  }

  /**
   * Run webpack in a promise
   */
  runWebpack (outputPath) {
    this.log.verbose('Running webpack bundler');
    return new Promise((resolve, reject) => {
      // run webpack to create the bundle file in assets
      const webpackConfig = require(this.path.resolve(this.path.join(this.opt.template, 'src', 'webpack.config.js')));
      const webpack = require('webpack');
      // set output
      webpackConfig.output.path = outputPath;
      this.log.debug('webpack output folder: ' + webpackConfig.output.path);
      // legacy custom templates still read these constants
      const plugins = [
        new webpack.DefinePlugin({
          API_DATA: this.api.data,
          API_PROJECT: this.api.project,
        }),
      ];
      webpackConfig.plugins = plugins;

      // if the --debug flag is passed, produce unminified bundle with inline map

      let mode = 'production';
      // https://webpack.js.org/configuration/devtool/ - constistent type
      let devtool = '';
      if (this.opt.debug) {
        mode = 'development';
        devtool = 'inline-source-map';
      }
      webpackConfig.mode = mode;
      webpackConfig.devtool = devtool || false;

      const compiler = webpack(webpackConfig);
      compiler.run((err, stats) => {
        if (err) {
          this.log.error('Webpack failure:', err);
          return reject(err);
        }
        if (stats.hasErrors()) {
          const info = stats.toJson({ all: false, errors: true });
          info.errors.forEach(error => this.log.error('Webpack failure: ' + (error.message || error)));
          return reject(new Error('Webpack failed to build the bundle'));
        }
        this.log.debug('Generated bundle with hash: ' + stats.hash);
        return resolve(outputPath);
      });
    });
  }

  // Escapes angle brackets so the JSON can sit inside a script tag
  inlineJson (value) {
    return JSON.stringify(value === undefined ? null : value).replace(/</g, '\\u003c');
  }

  /**
   * Get index.html content as string with placeholder values replaced
   */
  getIndexContent () {
    const projectInfo = JSON.parse(this.api.project);
    const title = projectInfo.title || projectInfo.name || 'Loading...';
    const description = projectInfo.description || projectInfo.name || 'API Documentation';
    const openapi = this.api.openapi || {};

    const indexHtml = this.fs.readFileSync(this.path.join(this.opt.template, 'index.html'), 'utf8');
    return indexHtml.toString()
      // replace titles, descriptions and cache busting query params
      .replace(/__API_NAME__/g, () => title)
      .replace(/__API_DESCRIPTION__/g, () => description)
      .replace(/__API_CACHE_BUSTING_QUERY_PARAM__/g, () => this.cacheBustingQueryParam)
      .replace(/__OPENAPI_DOCUMENT__/g, () => this.inlineJson(openapi.document || null))
      .replace(/__OPENAPI_HISTORY__/g, () => this.inlineJson(openapi.history || []))
      .replace(/__OPENAPI_CONFIG__/g, () => this.inlineJson(projectInfo));
  }

  // Font files cannot travel with a single html file, embed the web formats
  inlineFonts (css) {
    const fontsDir = this.path.join(this.opt.template, 'fonts');
    const mimes = { woff2: 'font/woff2', woff: 'font/woff' };
    if (!this.fontCache) { this.fontCache = {}; }
    const cache = this.fontCache;
    return css.replace(/url\((["']?)[^"')]*?(glyphicons-halflings-regular\.(woff2|woff|ttf|eot|svg))[^"')]*\1\)/g, (match, quote, file, ext) => {
      if (!mimes[ext]) { return 'url(data:,)'; }
      if (!cache[file]) {
        const fontPath = this.path.join(fontsDir, file);
        if (!this.fs.existsSync(fontPath)) { return match; }
        cache[file] = 'data:' + mimes[ext] + ';base64,' + this.fs.readFileSync(fontPath).toString('base64');
      }
      return 'url(' + cache[file] + ')';
    });
  }

  createSingleFile () {
    // dest is a file path, so get the folder with dirname
    this.createDir(this.path.dirname(this.opt.dest));

    // get all css content
    const bootstrapCss = this.inlineFonts(this.fs.readFileSync(this.findAsset('bootstrap/dist/css/bootstrap.min.css'), 'utf8'));
    const prismCss = this.fs.readFileSync(this.findAsset('prismjs/themes/prism-tomorrow.css'), 'utf8');
    // bootstrap already declares the icon font, drop the duplicate face
    const mainCss = this.fs.readFileSync(this.path.join(this.opt.template, 'src', 'css', 'main.css'), 'utf8').replace(/@font-face\s*\{[^}]*\}/g, '');
    const tmpPath = this.fs.mkdtempSync(this.path.join(os.tmpdir(), 'apidoc-'));
    return this.runWebpack(tmpPath).then(tmpPath => {
      const mainBundle = this.fs.readFileSync(this.path.join(tmpPath, 'main.bundle.js'), 'utf8');

      // modify index html for single page use
      const indexContent = this.getIndexContent()
        // remove link to css normally in assets
        .replace(/<link href="assets[^>]*>/g, '')
        // remove call to main bundle in assets
        .replace(/<script src="assets[^>]*><\/script>/, '');

      // concatenate all the content (html + css + javascript bundle)
      const finalContent = `${indexContent}
      <style>${bootstrapCss} ${prismCss} ${mainCss}</style>
      <script>${mainBundle}</script>`;

      // create target file
      const finalPath = this.path.join(this.opt.dest, 'index.html');
      // make sure destination exists
      this.createDir(this.opt.dest);
      this.log.verbose(`Generating self-contained single file: ${finalPath}`);
      this.fs.writeFileSync(finalPath, finalContent);
      this.fs.removeSync(tmpPath);
    });
  }

  /**
   * Create a directory
   *
   * @param {string} dir Path of the directory to create
   */
  createDir (dir) {
    if (!this.fs.existsSync(dir)) {
      this.log.verbose('Creating dir: ' + dir);
      this.fs.mkdirsSync(dir);
    }
  }
}

module.exports = Writer;
