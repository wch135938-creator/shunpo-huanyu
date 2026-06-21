export class BaseManager {
  protected static instance: any;

  static getInstance<T extends BaseManager>(this: new () => T): T {
    if (!(this as any).instance) (this as any).instance = new this();
    return (this as any).instance;
  }
}
