import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { cleanJunkFiles, flattenDirectory, extractZip, IGNORE_LIST } from '../src/fs_utils';

test('Feature Test: Junk File Cleaner (cleanJunkFiles)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'junk-test-'));

  try {
    // Create regular files
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project');

    // Create junk files and junk directories
    fs.writeFileSync(path.join(tmpDir, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(tmpDir, 'thumbs.db'), 'junk');
    
    const pycacheDir = path.join(tmpDir, '__pycache__');
    fs.mkdirSync(pycacheDir);
    fs.writeFileSync(path.join(pycacheDir, 'module.cpython-310.pyc'), 'binary');

    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, '.DS_Store'), 'junk');
    fs.writeFileSync(path.join(subDir, 'app.js'), 'code');

    const cleaned = cleanJunkFiles(tmpDir);

    assert.equal(cleaned >= 3, true, 'Should have cleaned at least 3 junk files/folders');
    assert.equal(fs.existsSync(path.join(tmpDir, '.DS_Store')), false, '.DS_Store should be removed');
    assert.equal(fs.existsSync(path.join(tmpDir, 'thumbs.db')), false, 'thumbs.db should be removed');
    assert.equal(fs.existsSync(pycacheDir), false, '__pycache__ should be removed');
    assert.equal(fs.existsSync(path.join(subDir, '.DS_Store')), false, 'nested .DS_Store should be removed');

    // Regular files must remain intact
    assert.equal(fs.existsSync(path.join(tmpDir, 'index.js')), true, 'index.js must be preserved');
    assert.equal(fs.existsSync(path.join(tmpDir, 'README.md')), true, 'README.md must be preserved');
    assert.equal(fs.existsSync(path.join(subDir, 'app.js')), true, 'src/app.js must be preserved');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Feature Test: Directory Flattener (flattenDirectory)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flatten-test-'));

  try {
    // Create single nested directory: tmpDir/my-project/package.json
    const nestedDir = path.join(tmpDir, 'nested-project');
    fs.mkdirSync(nestedDir);
    fs.writeFileSync(path.join(nestedDir, 'package.json'), '{"name": "test"}');
    fs.writeFileSync(path.join(nestedDir, 'index.js'), 'console.log("flattened");');

    const levels = flattenDirectory(tmpDir);

    assert.equal(levels, 1, 'Should flatten 1 nested level');
    assert.equal(fs.existsSync(path.join(tmpDir, 'package.json')), true, 'package.json should now be in root');
    assert.equal(fs.existsSync(path.join(tmpDir, 'index.js')), true, 'index.js should now be in root');
    assert.equal(fs.existsSync(nestedDir), false, 'Original nested directory should be removed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Feature Test: ZIP Archive Extractor (extractZip)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
  const zipPath = path.join(tmpDir, 'archive.zip');
  const targetDir = path.join(tmpDir, 'extracted');

  try {
    // Create a real test zip
    const zip = new AdmZip();
    zip.addFile('config.json', Buffer.from(JSON.stringify({ active: true })));
    zip.addFile('app.py', Buffer.from('print("hello world")'));
    zip.writeZip(zipPath);

    extractZip(zipPath, targetDir);

    assert.equal(fs.existsSync(path.join(targetDir, 'config.json')), true, 'config.json must be extracted');
    assert.equal(fs.existsSync(path.join(targetDir, 'app.py')), true, 'app.py must be extracted');
    const content = fs.readFileSync(path.join(targetDir, 'app.py'), 'utf-8');
    assert.equal(content, 'print("hello world")');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
