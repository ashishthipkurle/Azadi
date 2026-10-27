// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude native build artifacts and temporary CMake directories from file watching
config.resolver.blockList = [
  /.*[/\\]android[/\\]\.cxx[/\\].*/,
  /.*[/\\]android[/\\]build[/\\].*/,
  /.*[/\\]node_modules[/\\].*[/\\]android[/\\].*/,
  /.*[/\\]node_modules[/\\].*[/\\]\.cxx[/\\].*/,
];

// Add WASM support
config.resolver.assetExts.push('wasm');

// Add COEP and COOP headers to support SharedArrayBuffer
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhancedMiddleware = originalEnhanceMiddleware
    ? originalEnhanceMiddleware(middleware, server)
    : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhancedMiddleware(req, res, next);
  };
};

// Reduce the number of workers to decrease resource usage
config.maxWorkers = 2;

module.exports = config;
