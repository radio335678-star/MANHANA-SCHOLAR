declare module "adm-zip" {
  export default class AdmZip {
    constructor(buffer?: Buffer | string);
    getEntry(name: string): { getData(): Buffer } | null;
  }
}
