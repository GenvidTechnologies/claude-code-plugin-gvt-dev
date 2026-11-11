// create-adr-evals/gvt-wiki-root.mjs
//
// Resolves the root folder of the installed gvt-wiki plugin (the folder that
// contains its `skills/`). Order:
//   1. GVT_WIKI_ROOT, as given.
//   2. ~/.claude/plugins/installed_plugins.json, key `gvt-wiki@gvt-plugins`:
//      the `scope: "user"` install, else the first entry with an `installPath`.
// Throws, naming GVT_WIKI_ROOT and the file, when nothing is found.
// `env`, `homedir` and `readFile` are injectable for tests.
//
// Run directly, it prints the root; on error it prints the message to stderr
// and exits 1.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_KEY = 'gvt-wiki@gvt-plugins';

export function gvtWikiRoot(opts = {}) {
  const env = opts.env ?? process.env;
  const homedir = opts.homedir ?? os.homedir;
  const readFile = opts.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));

  if (env.GVT_WIKI_ROOT) return env.GVT_WIKI_ROOT;

  const file = path.join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
  let parsed;
  try {
    parsed = JSON.parse(readFile(file));
  } catch (err) {
    throw new Error(
      `Cannot read ${file} (${err.message}). Set GVT_WIKI_ROOT to the gvt-wiki plugin folder.`,
    );
  }

  const installs = parsed?.plugins?.[PLUGIN_KEY];
  const usable = Array.isArray(installs) ? installs.filter((e) => e && e.installPath) : [];
  const chosen = usable.find((e) => e.scope === 'user') ?? usable[0];
  if (!chosen) {
    throw new Error(
      `No ${PLUGIN_KEY} install is recorded in ${file}. Install gvt-wiki or set GVT_WIKI_ROOT to its plugin folder.`,
    );
  }
  return chosen.installPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    console.log(gvtWikiRoot());
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
