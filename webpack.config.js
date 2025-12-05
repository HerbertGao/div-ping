import CopyPlugin from 'copy-webpack-plugin';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('webpack').Configuration} */
const config = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  // Source maps disabled in production to prevent source code exposure
  // Development builds use inline-source-map for debugging
  devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
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
        { from: '_locales', to: '_locales' },
        { from: 'LICENSE', to: 'LICENSE' },
        { from: 'README.md', to: 'README.md' }
      ]
    })
  ]
};

export default config;
