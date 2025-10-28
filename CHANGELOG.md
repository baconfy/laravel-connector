# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2024-10-28

### Fixed

- 🐛 Fixed package.json exports field order (types should come first)
- 🧪 Fixed test environment - changed from 'node' to 'happy-dom' for browser API support
- ✅ All 49 tests now passing (25 Sanctum tests were failing)
- 📦 Added happy-dom as dev dependency for DOM API testing

### Changed

- 🔧 Improved test setup to be more robust with document.cookie handling

## [2.0.0] - 2024-10-28

### Added

- ✨ Request/Response/Error interceptors
- ⚡ Automatic retry logic with configurable attempts and delay
- ⏱️ Request timeout support with AbortController
- 🎯 Better error handling and typing
- 📦 Array parameter support in query strings
- 🔧 Helper utilities for common operations
- 🧪 Comprehensive test coverage with Vitest
- 📚 Detailed documentation and examples
- 🔐 Enhanced CSRF token management for Sanctum
- 🚀 Better TypeScript support and generics
- 📊 Coverage reporting

### Changed

- 🔄 Improved response unwrapping logic
- 🛡️ Better error response handling
- 🎨 Refactored code structure for maintainability
- 📝 Enhanced JSDoc comments
- ⚙️ Updated build configuration with tsup

### Fixed

- 🐛 Fixed concurrent CSRF token requests
- 🔒 Fixed CSRF token caching issues
- 🎯 Fixed query parameter encoding
- 🔧 Fixed timeout handling with proper cleanup

## [1.0.0] - Initial Release

### Added

- Basic HTTP client functionality
- Laravel Sanctum support
- CSRF token handling
- Response unwrapping
- TypeScript support
