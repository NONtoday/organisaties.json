import organisaties from "../data/organisaties-orig.json" with {type: "json"};
import fs from "node:fs";

fs.writeFileSync("initialsortlist.json", JSON.stringify(organisaties[0].instellingen.map(e => e.uuid), null, 2));