# rMods

Two mods for Claude Code.

- **mod-curator**: `/mods` opens a pane listing your installed plugins, with Turn on / Turn off and Remove buttons.
- **ribbon-plus**: a fork of [ribbon](https://github.com/robonuggets/ribbon) (MIT). A usage band above the prompt in three sizes (tiny, mid and large), with bars that run from green to red as a window drains, recent activity, and session cost and burn rate. Arrows or `/ribbon-plus` switch the size, and the choice is remembered. See [its README](plugins/ribbon-plus/README.md) for screenshots of each size.

![ribbon-plus in its large size](plugins/ribbon-plus/assets/large.png)

## Install

At the prompt of a terminal session:

```
/plugin install mod-curator --marketplace allisonhere/rMods
/plugin install ribbon-plus --marketplace allisonhere/rMods
```

From a shell:

```
claude plugin install mod-curator --marketplace allisonhere/rMods
claude plugin install ribbon-plus --marketplace allisonhere/rMods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `allisonhere/rMods`, then Add plugin.

If you already use the original ribbon, turn it off first (`/mods` does that) so two bands don't show.

ribbon-plus keeps the original's MIT license; see `plugins/ribbon-plus/LICENSE`.
