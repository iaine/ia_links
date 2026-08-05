## Build the Add-On

cd into the app directory

npm install to load all the requirements. 

### Build Options

The build options are:

 *   node build.mjs --target firefox --version 0.0.1
 *   node build.mjs --target chrome  --version 0.0.1
 *   npm run build:firefox
 *   npm run build:chrome
 *   npm run build:all

 The --version number can be changed and should increment. 

### Options

Usage: node build.mjs [options]

  -t, --target <firefox|chrome>   Which browser to build for (required)
  -v, --version <semver>          Version to stamp into manifest.json (default: 0.0.1)
  -o, --out <dir>                 Output directory, relative to this script (default: dist)
  -h, --help                      Show this help