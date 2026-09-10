# JJJJ

A Stacked PR tool sitting atop [Jujutsu VCS](https://github.com/jj-vcs/jj).

`jjjj` introduces a bunch of commands related to stacked PRs workflow, which will pass-through any commands directly to `jj` for simplicity.

### Requirements

- [jj](https://www.jj-vcs.dev/latest/install-and-setup/)!
- The [`gh` utility from GitHub](https://cli.github.com) with the [`github/gh-stack`](https://github.com/github/gh-stack) extension
- Node.js 18 or higher

### Installation

```bash
npm install -g jjjj-cli
```

This installs the `j` command globally. You can verify with `j --help`.

#### Development Installation

If you want to contribute or run from source:

```bash
git clone https://github.com/dacuha-ic/jjjj.git
cd jjjj
npm install
npm run dev:install
```

This builds locally and installs a shim to `~/.local/bin/j`.

### How does a normal workflow look like?

```
$ j new -m foo
$ touch foo
$ j new -m bar
$ touch bar

# Creates bookmarks, pushes them, creates draft PRs, and links them as a native GitHub stack
$ j sync
# Mark all PRs up until to the current point as ready
$ j ready
```

#### Demo video

https://github.com/user-attachments/assets/8cbb6736-c486-4181-9deb-27069db5c7e3

### Main commands

**NOTE**: anything outside of this list will simply passthrough to JJ, so you can use j for anything jj too!

#### `sync`

Creates bookmarks if needed, fetches remote changes, re-pushes active layers with `jj git push`, then delegates PR creation and linking to `gh stack link`. For an existing native stack, `j sync` reads GitHub's stack metadata, retains merged PRs in the stack, rebases the remaining JJ revisions onto trunk, and appends new layers without directly changing PR bases. New PRs are drafts. Bookmark names use `{yourUsername}/{revId}/your-revision-descriptions-first-line` and strip [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) prefixes (e.g. `feat: some fancy feature` becomes `some-fancy-feature`).
During sync, `j` renders each revision with its change ID, bookmark, commit subject, sync status, and associated PR number and URL. Native `gh stack` command output stays out of the rendered status view.

#### `restack`

Does a `jj git fetch`, followed by rebases for the whole current stack. You can pass `--all` to restack ALL the stacks to latest.

#### `stack`

`jj log` equivalent but only displays the current stack.

#### `ready`

Marks all PR up to the current point as ready

#### `merge`

**VERY EXPERIMENTAL**. Merges the stack's PRs up to the current point.
It will wait until each PR is mergeable, approved, etc. then merge, restack and sync.

#### `top` | `bot` | `prev` | `next`

Navigational commands to move through the stack

#### `desc`

Describes the current revision, a shorthand for `jj describe`, but instead of opening an editor, it just prompts for a commit description, enter to submit.

#### `aidesc`

Lets AI describe the current revision, with a picker of the changed files to send specific diffs over to OpenAI's API.

#### `clean`

Removes any dangling empty, mutable revisions.

#### `pull`

Pulls an existing branch from origin, useful for checking out code from other people.

### Config

You can create a `.jjjjrc.json` file in your home directory or within `~/.config/.jjjjrc.json`. A config file is **not** required for now.

- `openAIApiKey` only needed for `aidesc`
- `openAIBaseURL` if you use anything like a proxy to reach OpenAI's API.
- `githubToken` if you pass this, `jjjj` will use this for any github operations, otherwise it will fall back to use `gh auth token`
