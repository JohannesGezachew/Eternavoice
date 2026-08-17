import nextPlugin from "eslint-config-next";

const eslintConfig = [
  ...nextPlugin,
  {
    // .claude/worktrees holds checkouts of this same repo, so without this
    // every file gets linted once per worktree and the totals silently triple.
    ignores: [".next/**", "node_modules/**", ".claude/**"],
  },
];

export default eslintConfig;
