const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');

// Config
const browsers = ['chrome', 'edge', 'firefox'];
const vendorPath = 'src/vendor';
const srcPath = 'src';
const outPath = 'packages';

// Load files
function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Bundler: prepend vendor code to script
function bundleWithVendor(scriptPath, vendorFiles, vendorDir) {
  let code = '';
  for (const vf of vendorFiles) {
    const fullPath = path.join(vendorDir, vf);
    if (fs.existsSync(fullPath)) {
      code += `/* Vendor: ${vf} */\n${readFile(fullPath)}\n\n`;
    }
  }
  code += `/* Source: ${path.basename(scriptPath)} */\n${readFile(scriptPath)}`;
  return code;
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

  // Copy static files
  const staticFiles = ['manifest.json', 'popup.html', 'popup.js', 'popup.css',
                       'options.html', 'content.css'];
  for (const f of staticFiles) {
    const src = path.join(outDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, f));
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
          bgCode += `/* Source: background.js */\n${readFile(path.join(srcDir, 'background.js'))}\n`;
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
      bgCode += `/* Source: background.js */\n${readFile(path.join(srcDir, 'background.js'))}\n`;
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

// Create zip
function createZip(dir, outputZip) {
  const { execSync } = require('child_process');
  // Use Python for reliable zip creation
  const pythonCmd = `python -c "
import zipfile, os
files = []
for root, dirs, filenames in os.walk('${dir.replace(/\\/g, '\\\\')}'):
    for filename in filenames:
        if filename == 'install.rdf':
            continue
        file_path = os.path.join(root, filename)
        arcname = os.path.relpath(file_path, '${dir.replace(/\\/g, '\\\\')}')
        files.append((file_path, arcname))
files.sort(key=lambda x: (0 if x[1] == 'manifest.json' else 1, x[1]))
with zipfile.ZipFile('${outputZip}', 'w', zipfile.ZIP_DEFLATED) as zf:
    for file_path, arcname in files:
        zf.write(file_path, arcname)
print(f'Created {outputZip}: {os.path.getsize(\"${outputZip}\")} bytes')
"`;
  execSync(pythonCmd, { encoding: 'utf8', stdio: 'inherit' });
}

// Main
async function main() {
  console.log('Building browser extensions...');

  for (const browser of browsers) {
    await buildBrowser(browser);
    createZip(path.join(outPath, browser), `AI-Translate-${browser}.zip`);
  }

  console.log('\n=== Build Complete ===');
}

main().catch(console.error);
