# Changelog

All notable changes to the `genvid-dev` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and follows [semantic versioning](https://semver.org/).

## [Unreleased]

## [2.0.1] - 2026-06-02

### Fixed

- Trimmed the `publish-npm-package` skill description from 1609 to 1481 chars so
  it fits under the default `skillListingMaxDescChars` cap (1536) and is no longer
  silently truncated in the session skill listing. All positive and negative
  triggers preserved. (#1)

## [2.0.0] - 2026-05-31

### Changed

- **BREAKING:** Split the combined marketplace + plugin repo. The marketplace
  catalog now lives in `genvid-holdings/claude-code-marketplace`; this repo is
  the plugin only, renamed to `claude-code-plugin-genvid-dev`.
- **BREAKING:** Renamed the plugin namespace from `genvid` to `genvid-dev`.
  Skills are now invoked as `/genvid-dev:<name>` and agents dispatched as
  `genvid-dev:<name>`. Install handle is `genvid-dev@genvid-plugins`.
- Flattened the plugin tree to the repo root (was `plugins/genvid/`).

## [1.1.0] - 2026-05-31

## [1.0.0] - 2026-05-31
