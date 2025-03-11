import Thing from './src/index.ts';

const thing = new Thing();
const schools = await thing.getSchools();
const organisaties = await thing.schoolsToOrganisaties(schools);

thing.writeOrganisaties(organisaties);