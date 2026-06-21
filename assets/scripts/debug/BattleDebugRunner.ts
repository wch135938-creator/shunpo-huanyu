import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

console.log('[BattleDebugRunner] module loaded');

@ccclass('BattleDebugRunner')
export class BattleDebugRunner extends Component {
    constructor() {
        super();
        console.log('[BattleDebugRunner] constructor');
    }

    onLoad() {
        console.log('[BattleDebugRunner] onLoad');
    }

    onEnable() {
        console.log('[BattleDebugRunner] onEnable');
    }

    start() {
        console.log('[BattleDebugRunner] start');
    }

    update(deltaTime: number) {
        // 只输出一次，避免刷屏
        this.enabled = false;
        console.log('[BattleDebugRunner] update (disabled now)');
    }
}
