# JJJJ

A Stacked PR tool sitting atop [Jujutsu VCS](https://github.com/jj-vcs/jj).

`jjjj` introduces a bunch of commands related to stacked PRs workflow, which will pass-through any commands directly to `jj` for simplicity.

### Requirements
This requires Node.js as well as the [`gh` utility from GitHub](https://cli.github.com).

### Installation
- Clone this repo in any directory
- Add `~/.local/bin` to your PATH
- Execute `npm install` in the cloned directory
- `j` is the binary that gets instsalled in `~/.local/bin`. If you can execute this already you're good to go, otherwise your shell might need to restart.

### How does a normal workflow look like?

```
$ j new -m foo
$ touch foo
$ j new -m bar
$ touch bar

# Creates bookmarks and pushes to Github
$ j sync
# Mark all PRs up until to the current point as ready
$ j ready
```

Main commands:

#### `sync`
Creates bookmarks (if needed) and pushes to Github. It will use `{yourUsername}/{revId}/your-revision-description`

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
Removes any dangling empty, mutable revisions. Useful for when

#### `pull`
Pulls an existing branch from origin, useful for checking out code from other people.


### Config
You can create a `.jjjjrc.json` file in your home directory or within `~/.config/.jjjjrc.json`. A config file is **not** required for now.

- `openAIApiKey` only needed for `aidesc`
- `openAIBaseURL` if you use anything like a proxy to reach OpenAI's API.
- `githubToken` if you pass this, `jjjj` will use this for any github operations, otherwise it will fall back to use `gh auth token`
