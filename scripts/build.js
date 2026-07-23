const fs = require('fs');
const path = require('path');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');
const { createDirectoryZip, releaseDirectory } = require('./release-utils');

// Config
const browsers = ['chrome', 'edge', 'firefox'];
const vendorPath = 'src/vendor';
const srcPath = 'src';
const outPath = 'browser-extensions';

// Load files
function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function stripBackgroundLoaders(code) {
  return code.replace(/^\s*importScripts\([^;]+;\s*\r?\n?/gm, '');
}

// Minify JS
async function minifyJS(code) {
  const result = await terserMinify(code, {
    compress: {
      passes: 2,
      drop_console: false
    },
    mangle: true,
    format: {
      comments: false
    }
  });
  return result.code;
}

// Minify CSS
function minifyCSS(code) {
  return new CleanCSS({ level: 1 }).minify(code).styles;
}

// Build browser package
async function buildBrowser(browser) {
  console.log(`\n=== Building ${browser} ===`);
  const srcDir = path.join(srcPath);
  const outDir = path.join(outPath, browser);
  const manifest = JSON.parse(readFile(path.join(outDir, 'manifest.json')));

  // Ensure output dir exists
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });

  // Copy static files from src when they are shared, while keeping browser-specific manifests.
  const staticFiles = ['manifest.json', 'popup.html', 'popup.js', 'popup.css',
                       'options.html', 'options.css', 'content.css'];
  for (const f of staticFiles) {
    const source = f === 'manifest.json' ? path.join(outDir, f) : path.join(srcDir, f);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(outDir, f));
    }
  }

  // Copy icons
  const icons = ['16', '48', '128'];
  for (const size of icons) {
    const iconFile = `icons/icon${size}.png`;
    const src = path.join(outDir, iconFile);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, iconFile));
    }
  }

  // Bundle and minify background.js
  // For MV2: manifest.background.scripts is an array
  // For MV3: manifest.background.service_worker is a single file
  const isMV3 = manifest.manifest_version === 3;
  const bgConfig = manifest.background;

  if (bgConfig) {
    let bgCode = '';

    if (bgConfig.scripts) {
      // MV2: bundle in order
      for (const script of bgConfig.scripts) {
        if (script === 'background.js') {
          bgCode += `/* Shared vocabulary */\n${readFile('src/vocabulary.js')}\n`;
          bgCode += `/* Source: background.js */\n${stripBackgroundLoaders(readFile(path.join(srcDir, 'background.js')))}\n`;
        } else if (script.startsWith('vendor/') || script === 'browser-adapter.js') {
          const vendorFile = script === 'browser-adapter.js' ? 'browser-adapter.js' : script;
          bgCode += `/* Vendor: ${vendorFile} */\n${readFile(path.join(outDir, vendorFile))}\n`;
        }
      }
    } else if (bgConfig.service_worker) {
      // MV3: bundle vendor + browser-adapter + background
      // Service worker doesn't support importScripts, so we need to bundle everything
      const vendorFiles = fs.readdirSync(vendorPath);
      for (const vf of vendorFiles) {
        if (vf.endsWith('.js')) {
          bgCode += `/* Vendor: ${vf} */\n${readFile(path.join(vendorPath, vf))}\n`;
        }
      }
      bgCode += `/* Browser adapter */\n${readFile(path.join(outDir, 'browser-adapter.js'))}\n`;
      bgCode += `/* Shared vocabulary */\n${readFile('src/vocabulary.js')}\n`;
      bgCode += `/* Source: background.js */\n${stripBackgroundLoaders(readFile(path.join(srcDir, 'background.js')))}\n`;
    }

    if (bgCode) {
      const minBg = await minifyJS(bgCode);
      writeFile(path.join(outDir, 'background.js'), minBg);
      console.log(`  background.js: ${minBg.length} bytes`);
    }
  }

  // Bundle and minify content.js
  if (manifest.content_scripts) {
    const csScripts = manifest.content_scripts[0].js || [];
    let csCode = '';
    for (const script of csScripts) {
      if (script === 'content.js') {
        csCode += `/* Source: content.js */\n${readFile(path.join(srcDir, 'content.js'))}\n`;
      } else if (script.startsWith('vendor/') || script === 'browser-adapter.js') {
        const vendorFile = script === 'browser-adapter.js' ? 'browser-adapter.js' : script;
        csCode += `/* Vendor: ${vendorFile} */\n${readFile(path.join(outDir, vendorFile))}\n`;
      }
    }
    const minCs = await minifyJS(csCode);
    writeFile(path.join(outDir, 'content.js'), minCs);
    console.log(`  content.js: ${csCode.length} -> ${minCs.length} bytes`);
  }

  // Copy vendor files (already minified)
  const vendorFiles = fs.readdirSync(vendorPath);
  for (const vf of vendorFiles) {
    if (vf.endsWith('.js')) {
      fs.copyFileSync(path.join(vendorPath, vf), path.join(outDir, 'vendor', vf));
    }
  }

  // Generate browser-adapter.js with correct prefix for this browser
  const prefixes = { chrome: 'ch_', edge: 'ed_', firefox: 'fx_' };
  const prefix = prefixes[browser] || 'fx_';
  const adapterSrc = readFile(path.join(srcDir, 'browser-adapter.js'));
  const adapterWithPrefix = adapterSrc.replace(/const STORAGE_PREFIX = "[^"]*"/, `const STORAGE_PREFIX = "${prefix}"`);
  writeFile(path.join(outDir, 'browser-adapter.js'), adapterWithPrefix);

  // Copy and minify options.js (read from src, write to out)
  const optionsSrc = readFile(path.join(srcDir, 'options.js'));
  const minOptions = await minifyJS(optionsSrc);
  writeFile(path.join(outDir, 'options.js'), minOptions);
  console.log(`  options.js: ${optionsSrc.length} -> ${minOptions.length} bytes`);

  // Minify content.css
  const cssSrc = readFile(path.join(outDir, 'content.css'));
  const minCss = minifyCSS(cssSrc);
  writeFile(path.join(outDir, 'content.css'), minCss);
  console.log(`  content.css: ${cssSrc.length} -> ${minCss.length} bytes`);

  // Minify options.css
  const optCssSrc = readFile(path.join(outDir, 'options.css'));
  const minOptCss = minifyCSS(optCssSrc);
  writeFile(path.join(outDir, 'options.css'), minOptCss);
  console.log(`  options.css: ${optCssSrc.length} -> ${minOptCss.length} bytes`);

  // Minify popup.css
  const popupCssSrc = readFile(path.join(outDir, 'popup.css'));
  const minPopupCss = minifyCSS(popupCssSrc);
  writeFile(path.join(outDir, 'popup.css'), minPopupCss);
  console.log(`  popup.css: ${popupCssSrc.length} -> ${minPopupCss.length} bytes`);

  return outDir;
}

// Main
async function main() {
  const version = JSON.parse(readFile(path.join(outPath, 'chrome', 'manifest.json'))).version;
  const releaseDir = releaseDirectory(process.cwd(), version);
  fs.mkdirSync(releaseDir, { recursive: true });
  console.log('Building browser extensions...');

  for (const browser of browsers) {
    await buildBrowser(browser);
    await createDirectoryZip(path.join(outPath, browser), path.join(releaseDir, `AI-Translate-${browser}.zip`), ['install.rdf']);
  }

  console.log('\n=== Build Complete ===');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
