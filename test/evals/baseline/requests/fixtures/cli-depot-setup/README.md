# depot

Stock keeping for a small shop, from the command line. Plain Node, no dependencies and no build step;
`npm test` runs `node --test`. Nothing is installed in this checkout, so there is no `node_modules`.

The stock lives in one JSON file: `depot.json` in the current folder, or the path in `DEPOT_DB`.

| Command                                                       | What it does           |
| ------------------------------------------------------------- | ---------------------- |
| `depot init [--name <store>] [--currency <code>]`             | creates the stock file |
| `depot item list`                                             | lists the items        |
| `depot item get <id>`                                         | shows one item         |
| `depot item add --name <name> --qty <n> [--warehouse <name>]` | adds an item           |
| `depot warehouse show-all`                                    | lists the warehouses   |
| `depot sync status`                                           | says if a token is set |

`depot init` asks for the store name and the currency when a flag is left out, then asks before it creates the file.
The cloud backup reads its token from `DEPOT_SYNC_TOKEN` or from the credentials file (`src/sync.mjs`).

`scripts/nightly.sh` runs on the warehouse machine every night and mails the two reports it writes.
