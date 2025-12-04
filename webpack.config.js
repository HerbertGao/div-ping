const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    background: './src/ts/background.ts',
    content: './src/ts/content.ts',
    popup: './src/ts/popup.ts',
    options: './src/ts/options.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].js',
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icons', to: 'icons' },
        { from: 'src/*.html', to: '[name][ext]' },
        { from: 'src/css', to: 'css' },
        { from: 'LICENSE', to: 'LICENSE' },
        { from: 'README.md', to: 'README.md' }
      ]
    })
  ]
};
