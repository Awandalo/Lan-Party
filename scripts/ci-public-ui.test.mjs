import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result = await build({
  stdin: {
    resolveDir: process.cwd(), loader: 'tsx',
    contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import {MemoryRouter} from 'react-router';
      import Home from './src/pages/Home';
      import Events from './src/pages/Events';
      import Footer from './src/components/Footer';
      export const home = () => renderToStaticMarkup(<MemoryRouter><Home/></MemoryRouter>);
      export const events = () => renderToStaticMarkup(<MemoryRouter><Events/></MemoryRouter>);
      export const footer = () => renderToStaticMarkup(<MemoryRouter><Footer/></MemoryRouter>);
    `,
  },
  bundle: true, packages: 'external', write: false, platform: 'node',
  define: {'import.meta.env': '{}'},
  format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
});
const compiled = new Module(import.meta.filename);
compiled.paths = Module._nodeModulePaths(process.cwd());
compiled._compile(result.outputFiles[0].text, import.meta.filename);
const ui = compiled.exports;
test('public home exposes event navigation and named content sections', () => {
  const html = ui.home();
  assert.match(html, /<h1[^>]*>/);
  assert.match(html, /href="\/events"/);
  assert.match(html, /aria-labelledby="news-title"/);
});
test('public events exposes both filters and a polite result region', () => {
  const html = ui.events();
  assert.match(html, /aria-pressed="true">Upcoming events/);
  assert.match(html, /aria-pressed="false">Past events/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /Manage events|href="\/manage/);
});
test('public footer renders site identity', () => {
  assert.match(ui.footer(), /<footer/);
  assert.match(ui.footer(), /LAN Party/);
});
