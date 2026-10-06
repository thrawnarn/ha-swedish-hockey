---
name: hockey-release
description: Prepare and push a Svensk hockey release - privacy sweep, version bump, tag, push. Use before any git push, and when asked to release, publish or tag.
---

# Releasing Svensk hockey

The repository is meant to be public, and history is published with it.

## Privacy sweep (before every push)

Search what is about to be pushed - `git log -p origin/main..HEAD`, or the
whole history before the first push - for:

- names of people, home addresses, phone numbers, e-mail addresses other than
  the author's;
- entity ids, device ids, config entry ids, Telegram chat ids or anything
  else from one installation;
- tokens, keys, passwords;
- real league data copied into tests or fixtures (the tests use a made-up
  league).

`notes/` is gitignored and must stay out of history.

## Version

Bump `version` in `custom_components/swedish_hockey/manifest.json` and in
`frontend/package.json` together. Run every test (`hockey-test`), rebuild the
card, and commit.

## Tag and push

```sh
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --tags   # origin: git@github.com:thrawnarn/ha-swedish-hockey.git
```

The repo's `core.sshCommand` uses `/data/home/.ssh/swedish_hockey_config`,
which selects the repo's own deploy key; a GitHub deploy key belongs to one
repository, so it is not the ChargeSteer one. CI (tests, hassfest, HACS) runs
on GitHub; a deploy key gives git access only, so ask for the Actions results.
