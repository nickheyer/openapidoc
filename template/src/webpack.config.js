/*
 * openapidoc
 * https://github.com/nickheyer/openapidoc
 *
 * Licensed under the MIT license.
 */

/* webpack js bundler config file */
const path = require('path');
const { ESBuildMinifyPlugin } = require('esbuild-loader');

module.exports = {
  entry: path.resolve(__dirname, 'main.js'),
  // mode is set at runtime
  resolve: {
    extensions: ['.js', '.mjs'],
    fallback: {
      util: false,
    },
  },
  output: {
    filename: 'main.bundle.js',
    // path is set at runtime
  },
  optimization: {
    minimizer: [
      new ESBuildMinifyPlugin({
        target: 'es2015',
      }),
    ],
  },
};
