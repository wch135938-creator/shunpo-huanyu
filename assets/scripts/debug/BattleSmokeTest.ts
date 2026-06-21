import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('BattleSmokeTest')
export class BattleSmokeTest extends Component {
    onLoad() {
        console.log('[BattleSmokeTest] onLoad');
    }

    onEnable() {
        console.log('[BattleSmokeTest] onEnable');
    }

    start() {
        console.log('[BattleSmokeTest] start');
    }
}
