# organisaties.json reconstructor

A script to reconstruct the `organisaties.json` file.

## Why

when Somtoday moved to their "gloednieuwe webomgeving", and deprecated their ELO februari 28th (2025), they also removed the endpoint on which the old app and, more importantly, most community-made projects that interact with the Somtoday API, relied ([https://servers.somtoday.nl/organisaties.json](https://servers.somtoday.nl/organisaties.json)).

## Usage

### just fetching the one from GitHub (updated regularly)

[https://raw.githubusercontent.com/NONtoday/organisaties.json/refs/heads/main/organisaties.json](https://raw.githubusercontent.com/NONtoday/organisaties.json/refs/heads/main/organisaties.json)

### running the script yourself

```sh
git clone https://github.com/NONtoday/organisaties.json.git
cd organisaties.json
deno run -A generate.ts
```
