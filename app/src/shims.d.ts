declare module '*.png' {
  const source: string;
  export default source;
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: any);
    window: any;
  }
}
