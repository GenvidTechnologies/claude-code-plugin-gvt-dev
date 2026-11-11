// Frontmatter of a fixture skill that declares the wiki schema expectation the
// way a wiki-owning plugin does: the declared path `docs/wiki-schema.md` with a
// `prefer` location inside the bundle. Tests of the `prefer` mechanism write it
// into a throwaway plugin root with writeSkill (helpers/fixture-plugin.mjs), so
// they do not depend on which real skill declares the expectation.

export const WIKI_SCHEMA_SKILL_NAME = 'wiki-fixture';

export const WIKI_SCHEMA_SKILL_FRONTMATTER = [
  `name: ${WIKI_SCHEMA_SKILL_NAME}`,
  'description: Fixture skill that declares the wiki schema expectation.',
  'metadata:',
  '  expects:',
  '    files:',
  '      - path: docs/wiki-schema.md',
  '        prefer: <wikiDir>/schema.md',
  '        required: false',
  '        reason: The fixture wiki schema, resolved as the paths override for this key, else <wikiDir>/schema.md, else docs/wiki-schema.md',
].join('\n');
