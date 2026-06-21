export class BaseSystem {
  protected static instance: any;

  static getInstance<T extends BaseSystem>(this: new () => T): T {
    if (!(this as any).instance) (this as any).instance = new this();
    return (this as any).instance;
  }
}
