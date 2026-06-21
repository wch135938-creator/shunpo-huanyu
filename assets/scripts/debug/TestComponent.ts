import { _decorator, Component } from "cc";
const { ccclass } = _decorator;

@ccclass("TestComponent")
export class TestComponent extends Component {
    start() {
        console.log("[TestComponent] loaded");
    }
}
