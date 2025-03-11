import fs from "node:fs";
import path from "node:path";

type UUIDv4 = `${string}-${string}-4${string}-${string}-${string}`;

interface Instelling {
    uuid: UUIDv4,
    naam: string,
    plaats: Uppercase<string>,
    oidcurls: {
        omschrijving: string,
        url: string,
        domain_hint: string,
    }[],
}

interface School {
    id: UUIDv4,
    label: `${Instelling["naam"]} - ${Instelling["plaats"]}`,
    value: Instelling["naam"],
};

export default class {
    private cookies: string = "";
    private i = 0;

    private async newCookies() {
        const b = fetch("https://inloggen.somtoday.nl/", { redirect: "manual" });
        this.cookies = (await b).headers.getSetCookie().map(e => e.split(";")[0]).join("; ");
    }

    async getSchools(options = { silent: false }): Promise<School[]> {
        let schools: School[] = [];

        if (!this.cookies) await this.newCookies();

        // list schools
        let i = 0;
        for (const letter1 of [...Array(26)].map((_, i) => String.fromCharCode(97 + i))) {
            for (const letter2 of [...Array(26)].map((_, i) => String.fromCharCode(97 + i))) {
                i++;
                const a = fetch(`https://inloggen.somtoday.nl/?0--panel-organisatieSelectionForm-organisatieSearchFieldPanel-organisatieSearchFieldPanel_body-organisatieSearchField&term=${letter1}${letter2}`, {
                    "headers": {
                        "cookie": this.cookies,
                        "Referer": "https://inloggen.somtoday.nl/",
                    },
                    "body": null,
                    "method": "GET"
                });
                schools.push(...await (await a).json());

                if (!options.silent) Deno.stdout.write(new TextEncoder().encode(`\r${letter1}${letter2} ${(100 * i / (26 ** 2)).toFixed(1)}%`));
            }
        }

        // dedupe schools
        schools = schools.filter((school, index) => schools.findIndex(e => e.id === school.id) === index);

        if (import.meta.dirname === undefined) throw new Error("import.meta.dirname is undefined");

        // sort schools
        const sortlist: UUIDv4[] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../data/sortlist.json"), 'utf-8'));
        sortlist.push(...schools.filter(school => !sortlist.includes(school.id)).map(school => school.id));
        fs.writeFileSync(path.join(import.meta.dirname, "../data/sortlist.json"), JSON.stringify(sortlist, null, 2));
        schools.sort((a, b) => sortlist.indexOf(a.id) - sortlist.indexOf(b.id));

        return schools;
    }

    private schoolToInstelling(school: School): Instelling {
        return {
            uuid: school.id as UUIDv4,
            naam: school.value,
            plaats: ([...school.label.matchAll(/.* - (?<plaats>.*)$/g)][0]?.groups?.plaats ?? "") as Uppercase<string>,
            oidcurls: [],
        };
    }

    async schoolsToOrganisaties(schools: School[], options = { silent: false }): Promise<[{ instellingen: Instelling[]; }]> {
        const organisaties: [{ instellingen: Instelling[]; }] = [{
            instellingen: [],
        }];

        organisaties[0].instellingen.push(...schools.map(school => this.schoolToInstelling(school)));

        for (const instelling of organisaties[0].instellingen) {
            await this.addOIDCUrls(instelling);
            if (!options.silent) console.log(instelling);
        }

        return organisaties;
    }

    private async addOIDCUrls(instelling: Instelling): Promise<void> {
        this.i++;

        // select instelling
        const authSelOrgReq = fetch("https://inloggen.somtoday.nl/?0-1.-panel-organisatieSelectionForm", {
            "headers": {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": this.cookies,
                "Referer": "https://inloggen.somtoday.nl/?0",
            },
            "body": `nextLink=x&organisatieSearchField--selected-value-1=${encodeURIComponent(instelling.uuid)}&organisatieSearchFieldPanel%3AorganisatieSearchFieldPanel_body%3AorganisatieSearchField=${encodeURIComponent(instelling.naam)}`,
            "method": "POST",

            redirect: "manual"
        });

        const authPreUrl = (await authSelOrgReq).headers.get("location");
        if (!authPreUrl) throw new Error(`Failed to get auth url (status: ${(await authSelOrgReq).status})`);

        const authPreReq = fetch(authPreUrl, {
            headers: {
                cookie: this.cookies,
                referer: "https://inloggen.somtoday.nl/?0",
            },
            redirect: "manual",
        });

        const authIntUrl = (await authPreReq).headers.get("location");
        if (!authIntUrl) {
            // this is normal behaviour after _many_ requests
            if (this.i > 25) {
                this.i = 0;

                const b = fetch("https://inloggen.somtoday.nl/", { redirect: "manual" });
                this.cookies = (await b).headers.getSetCookie().map(e => e.split(";")[0]).join("; ");

                await this.addOIDCUrls(instelling);
                return;
            } else throw new Error(`Failed to get auth int url (status: ${(await authPreReq).status})`);
        };

        // list SSO urls
        const authIntReq = fetch(authIntUrl, {
            headers: {
                cookie: this.cookies,
                referer: "https://inloggen.somtoday.nl/?0",
            },

            redirect: "manual",
        });
        const authIntReqBody = await (await authIntReq).text();

        type ssoLink = { name: string, url: string, oidcurl?: string; };

        const ssoLinks: ssoLink[] = [...authIntReqBody.matchAll(/sso-link[" ][^>]*>.+?(?<url>[^"]+?ssoButtons.[^"]*).+?span>(?<name>.+?)<\/span>/gs)].map(e => {
            if (e.groups?.name && e.groups?.url)
                return { name: e.groups?.name, url: e.groups?.url?.replaceAll("&amp;", "&") };
            else return false;
        }).filter(e => e !== false);

        // get OIDC urls
        for (const ssoLink of ssoLinks) {
            if (!ssoLink.url) continue;

            const ssothingyreq = fetch(new URL(ssoLink.url, "https://inloggen.somtoday.nl/"), {
                headers: {
                    cookie: this.cookies,
                    referer: authIntUrl,
                },

                redirect: "manual",
            });

            if ((await ssothingyreq).status !== 302) throw new Error(`Failed to get SSO url (status: ${(await ssothingyreq).status})`);
            const oidcRedirect = (await ssothingyreq).headers.get("location");
            if (!oidcRedirect) throw new Error(`Failed to get OIDC redirect (status: ${(await ssothingyreq).status})`);
            const oidcRedirectUrl = new URL(oidcRedirect);
            const iss = oidcRedirectUrl.searchParams.get("iss");

            ssoLink.oidcurl = iss ?? undefined;
        }

        // add OIDC urls to instelling
        for (const ssoLink of ssoLinks) {
            if (!ssoLink.oidcurl) continue;

            let domain_hint;
            if (new URL(ssoLink.oidcurl).hostname === "login.microsoftonline.com")
                domain_hint = new URL(ssoLink.oidcurl).pathname.split("/")[1];

            instelling.oidcurls.push({
                omschrijving: ssoLink.name.replaceAll("&amp;", "&").replaceAll("&#039;", "'"),
                url: ssoLink.oidcurl,
                domain_hint: domain_hint ?? "",
            });
        }
    }

    writeOrganisaties(organisaties: [{ instellingen: Instelling[]; }]): void {
        if (import.meta.dirname === undefined) throw new Error("import.meta.dirname is undefined");

        fs.writeFileSync(path.join(import.meta.dirname, "../organisaties.json"), JSON.stringify(organisaties).replaceAll(`,{"uuid":`, `, {"uuid":`));
        fs.writeFileSync(path.join(import.meta.dirname, "../organisaties-formatted.json"), JSON.stringify(organisaties, null, 4));
    }
}