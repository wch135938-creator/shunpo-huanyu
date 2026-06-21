import { UIStateStore } from "./UIStateStore";

export class UIRenderAdapter {

    private static _inited = false;

    static init() {
        if (this._inited) return;
        this._inited = true;

        UIStateStore.subscribe("equipment", (data: any) => {
            console.log("[UIRenderAdapter] equipment update received", data);
            this.renderEquipment(data);
        });
    }

    static renderEquipment(data: any) {
        console.log("[UIRenderAdapter] renderEquipment called", data);

        // ⚠️ v0.1 只做日志，不操作节点
    }
}