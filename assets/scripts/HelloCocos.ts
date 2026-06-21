import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('HelloCocos')
export class HelloCocos extends Component {
    protected onLoad(): void {
        console.log('[HelloCocos] onLoad');
    }

    protected start(): void {
        console.log('[HelloCocos] start');
    }
}
